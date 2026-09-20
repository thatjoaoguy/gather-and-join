/**
 * Measures the one thing the postMessage substrate actually puts at risk:
 * how far the dead-reckoned position estimate drifts from the video's true
 * position between `infoDelivery` ticks.
 *
 * Runs without the extension, so it works even where `--load-extension` does
 * not. Ground truth is sampled inside the cross-origin iframe and the estimate
 * in the top frame, both stamped with Date.now() (shared across frames, unlike
 * performance.now()), then compared offline — so neither number pays for a CDP
 * round trip.
 *
 * Usage: node --experimental-strip-types src/embed-drift-probe.ts [facade.js]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { startPlayerServer } from './player-server.ts';

const PORT = Number(process.env.PROBE_PORT ?? 14711);
const SECONDS = Number(process.env.PROBE_SECONDS ?? 30);
const FACADE_JS = process.argv[2];

type Sample = [number, number]; // [Date.now(), seconds]

function stats(errorsMs: number[]) {
  const sorted = [...errorsMs].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
  const mean = errorsMs.reduce((a, b) => a + b, 0) / errorsMs.length;
  return { n: errorsMs.length, mean, p50: at(50), p95: at(95), p99: at(99), max: sorted[sorted.length - 1]! };
}

/** True position at time `t`, linearly interpolated between the truth samples. */
function truthAt(truth: Sample[], t: number): number | null {
  if (truth.length < 2 || t < truth[0]![0] || t > truth[truth.length - 1]![0]) return null;
  let lo = 0, hi = truth.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (truth[mid]![0] <= t) lo = mid; else hi = mid; }
  const [t0, v0] = truth[lo]!, [t1, v1] = truth[hi]!;
  // Never interpolate across a discontinuity: a seek makes the bracketing pair
  // jump seconds apart, and a straight line through it invents a position the
  // video never had. Those samples are unmeasurable, not wrong.
  if (Math.abs((v1 - v0) * 1000 - (t1 - t0)) > 200) return null;
  return t1 === t0 ? v0 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
}

async function main() {
  if (!FACADE_JS || !fs.existsSync(FACADE_JS)) throw new Error(`pass the transpiled facade js (got ${FACADE_JS})`);
  const facadeSrc = fs.readFileSync(FACADE_JS, 'utf8');
  const server = await startPlayerServer(PORT);
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/drivewatch/urn:hbo:episode:G0000001`);
    await page.waitForSelector('#embed');

    // The facade is the real source file, transpiled — not a copy that can drift from it.
    await page.addScriptTag({ content: `${facadeSrc}\nwindow.__YtEmbedMedia = YtEmbedMedia;`, type: 'module' });
    await page.waitForFunction(() => !!(window as any).__YtEmbedMedia);

    const embedFrame = page.frames().find((f) => f.url().includes('/ytembed'));
    if (!embedFrame) throw new Error('embed frame not found');
    await embedFrame.waitForSelector('video');

    await page.evaluate(() => {
      const f = document.getElementById('embed') as HTMLIFrameElement;
      (window as any).__media = new (window as any).__YtEmbedMedia(f, new URL(f.src).origin);
    });

    await page.click('#play');
    await page.waitForFunction(() => (window as any).__media.paused === false, null, { timeout: 15_000 });
    await page.waitForTimeout(1500); // let the first ticks land before sampling

    // Recorders: 20ms in both frames, same clock.
    await embedFrame.evaluate(() => {
      (window as any).__truth = [] as Sample[];
      const v = document.querySelector('video')!;
      (window as any).__truthTimer = setInterval(() => (window as any).__truth.push([Date.now(), v.currentTime]), 20);
    });
    await page.evaluate(() => {
      (window as any).__est = [] as Sample[];
      (window as any).__estTimer = setInterval(() => (window as any).__est.push([Date.now(), (window as any).__media.currentTime]), 20);
    });

    await page.waitForTimeout(SECONDS * 1000);

    // A corrective seek is the other moment the estimate can be wrong.
    const seekAt = await page.evaluate(() => {
      const m = (window as any).__media;
      const target = m.currentTime + 12;
      m.currentTime = target;
      return Date.now();
    });
    await page.waitForTimeout(3000);

    await embedFrame.evaluate(() => clearInterval((window as any).__truthTimer));
    await page.evaluate(() => clearInterval((window as any).__estTimer));

    const truth: Sample[] = await embedFrame.evaluate(() => (window as any).__truth);
    const est: Sample[] = await page.evaluate(() => (window as any).__est);

    const steady: number[] = [];
    const postSeek: number[] = [];
    const worst: Array<{ atSec: number; errMs: number; est: number; truth: number }> = [];
    const t0 = est[0]![0];
    for (const [t, e] of est) {
      const tv = truthAt(truth, t);
      if (tv === null) continue;
      const errMs = Math.abs(e - tv) * 1000;
      if (t < seekAt) { steady.push(errMs); worst.push({ atSec: (t - t0) / 1000, errMs, est: e, truth: tv }); }
      else if (t > seekAt + 700) postSeek.push(errMs); // after the seek has been acknowledged
    }
    worst.sort((a, b) => b.errMs - a.errMs);
    console.log('\nworst steady samples (to tell a real stall from a startup artefact):');
    for (const w of worst.slice(0, 5))
      console.log(`  t+${w.atSec.toFixed(2)}s err=${w.errMs.toFixed(1)}ms est=${w.est.toFixed(3)} truth=${w.truth.toFixed(3)}`);

    const fmt = (s: ReturnType<typeof stats>) =>
      `n=${s.n} mean=${s.mean.toFixed(1)}ms p50=${s.p50.toFixed(1)}ms p95=${s.p95.toFixed(1)}ms p99=${s.p99.toFixed(1)}ms max=${s.max.toFixed(1)}ms`;
    console.log(`\ntruth samples=${truth.length} estimate samples=${est.length}`);
    console.log(`STEADY PLAYBACK  ${fmt(stats(steady))}`);
    if (postSeek.length) console.log(`AFTER SEEK       ${fmt(stats(postSeek))}`);
    const s = stats(steady);
    console.log(`\nverdict: p95 estimation error ${s.p95.toFixed(0)}ms (sync-accuracy.spec.ts allows 400ms pairwise spread)`);
    fs.writeFileSync(path.join(import.meta.dirname, '..', 'test-results', 'embed-drift.json'),
      JSON.stringify({ steady: stats(steady), postSeek: postSeek.length ? stats(postSeek) : null }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
