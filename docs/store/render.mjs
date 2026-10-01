// Renders the Chrome Web Store assets from the shot pages at exact pixel sizes.
//
//   node docs/store/render.mjs
//
// Output lands in docs/store/out/. The store rejects anything that is not
// exactly 1280x800 (or 640x400) for screenshots, 440x280 for the small tile,
// and 1400x560 for the marquee tile,
// so the viewport is fixed and deviceScaleFactor stays at 1.

import { readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, 'out')

// Playwright belongs to the e2e harness; borrow it from there rather than make
// the store graphics a workspace package of their own.
const harness = resolve(here, '../../tools/harness/package.json')
const playwright = await import(
  pathToFileURL(createRequire(harness).resolve('@playwright/test')).href
)
// The package is CommonJS, so the named exports hang off the default namespace.
const { chromium } = playwright.chromium ? playwright : playwright.default

const SHOTS = [
  { file: 'store-icon.html', out: 'store-icon-128.png', width: 128, height: 128, omitBackground: true },
  { file: 'shot-1-room.html', out: 'screenshot-1-room.png', width: 1280, height: 800 },
  { file: 'shot-3-setup.html', out: 'screenshot-3-setup.png', width: 1280, height: 800 },
  { file: 'promo-tile.html', out: 'promo-tile-440x280.png', width: 440, height: 280 },
  { file: 'promo-marquee.html', out: 'promo-marquee-1400x560.png', width: 1400, height: 560 },
  // The website's copy of the room shot. The landing page has its own headline,
  // so this keeps only the stage, on a transparent background so the shadows
  // fall on the page itself, at 2x for high-density screens. The viewport runs
  // taller than the 800px composition so the shadows below it are not cut off.
  { file: 'shot-1-room.html', out: 'site-room.webp', width: 1280, height: 960, scale: 2, stageOnly: true, omitBackground: true },
]

const icons = await readFile(resolve(here, '_icons.html'), 'utf8')

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const results = []
const temps = []

for (const shot of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: shot.scale ?? 1,
    // The mocks are dark-only by design; pin it so a light host OS cannot leak in.
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })

  // The symbol sheet is inlined into a sibling temp file rather than injected
  // via setContent: an about:blank document may not load file:// subresources,
  // so the page has to be navigated to from disk for its assets to resolve.
  const html = (await readFile(resolve(here, shot.file), 'utf8')).replace('<!--#icons-->', icons)
  const tmp = resolve(here, `.render-${shot.file}`)
  await writeFile(tmp, html)
  temps.push(tmp)

  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' })
  // Local @font-face and the generated frames must both be in before the capture.
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() =>
    Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map((img) => new Promise((done) => { img.onload = img.onerror = done })),
    ),
  )

  const missing = await page.evaluate(() =>
    [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
  )
  // The stills live in Git LFS; a clone without it has pointer files in their
  // place, which fail here rather than render as empty frames.
  if (missing.length) {
    throw new Error(
      `${shot.file}: image(s) failed to load: ${missing.join(', ')} (stills from Git LFS? run \`git lfs pull\`)`,
    )
  }

  // The popup overhangs the player at both ends, so the crop follows it. The
  // bottom margin is the popup's shadow, which fades out about 94px below it;
  // cutting it short leaves a visible edge on the page.
  // The headline and caption are hidden rather than removed so the stage keeps
  // the size it has in the store shot.
  const clip = shot.stageOnly
    ? await page.evaluate(() => {
        document.documentElement.classList.add('stage-only')
        const stage = document.querySelector('.stage').getBoundingClientRect()
        const popup = document.querySelector('.stage .frame').getBoundingClientRect()
        const top = Math.floor(Math.min(stage.top, popup.top) - 24)
        const bottom = Math.ceil(Math.max(stage.bottom, popup.bottom) + 100)
        return { x: 0, y: top, width: document.body.clientWidth, height: bottom - top }
      })
    : { x: 0, y: 0, width: shot.width, height: shot.height }

  const path = resolve(outDir, shot.out)
  const png = await page.screenshot({ clip, omitBackground: shot.omitBackground ?? false })
  // Playwright only writes PNG with alpha, which runs to megabytes for a photo
  // at 2x, so Chromium's own canvas encoder makes the WebP.
  await writeFile(
    path,
    shot.out.endsWith('.webp')
      ? await page.evaluate(async (b64) => {
          const img = document.createElement('img')
          img.src = `data:image/png;base64,${b64}`
          await img.decode()
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          canvas.getContext('2d').drawImage(img, 0, 0)
          const blob = await new Promise((done) => canvas.toBlob(done, 'image/webp', 0.85))
          return [...new Uint8Array(await blob.arrayBuffer())]
        }, png.toString('base64')).then((bytes) => Buffer.from(bytes))
      : png,
  )
  const scale = shot.scale ?? 1
  results.push(`${shot.out}  ${clip.width * scale}x${clip.height * scale}`)
  await page.close()
}

await browser.close()
await Promise.all(temps.map((t) => rm(t, { force: true })))

await writeFile(
  resolve(outDir, 'README.md'),
  `# Rendered store assets\n\nGenerated by \`docs/store/render.mjs\`. Do not hand-edit; re-run the script.\n\n${results
    .map((r) => `- \`${r}\``)
    .join('\n')}\n`,
)

console.log(results.join('\n'))
