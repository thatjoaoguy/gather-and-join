# Chrome Web Store graphics

The screenshots and promo tiles the Developer Dashboard asks for, built from the
design system's own surfaces so the listing cannot drift from the product. The
listing *text* lives in [`../../CHROMEWEBSTORE.md`](../../CHROMEWEBSTORE.md).
None of this ships in the extension ZIP.

## Why these are mocks

A store screenshot may not show HBO Max's player, its artwork, or anything that
could pass for an official HBO screen — that is both a trademark problem and a
"misleading screenshot" rejection risk. So the frames behind the extension are a
fictional series: AI-generated stills that resemble no real show, no real
person, and carry no text or logos. The extension UI on top is not a mock at
all; it is the real markup from
[`../design-system/screens/index.html`](../design-system/screens/index.html),
loading the real `system.css`. Change a token there and these re-render changed.

## Files

| File | What it is |
|------|-----------|
| `store-icon.html` | Branded 128×128 store icon with transparent padding |
| `shot-1-room.html` | In a room: popup, participant rail, tiles over the player |
| `shot-3-setup.html` | The setup page with both permissions granted |
| `promo-tile.html` | 440×280 small promo tile |
| `promo-marquee.html` | 1400×560 marquee promo tile |
| `shot.css` | Composition layer; additive to `system.css`, overrides no token |
| `_icons.html` | The SVG symbol sheet, inlined into each page at render time |
| `assets/*.png` | Generated stills and webcam portraits (see below) |
| `out/*.png` | Rendered output — upload these; do not hand-edit. Not committed: run the render first |
| `out/site-room.webp` | The room shot's stage alone at 2x on a transparent background, for the website's landing page (`static/img/room.webp` on the `docs` branch) |
| `site-copies-notice.html`, `site-copies-settings.html` | Close-ups of the rail for the website's "When copies differ" page: the notice, and the settings popover with the value adjusted |
| `out/site-copies-*.webp` | Those close-ups at 2x on a transparent background (`static/img/copies-*.webp` on the `docs` branch) |

## Rendering

The stills in `assets/` are stored with Git LFS. Run `git lfs install` once; in
a clone made without it, `git lfs pull` replaces the pointer files with the
images.

```sh
pnpm --filter @gj/harness exec node ../../docs/store/render.mjs
```

Playwright renders each page at a fixed viewport with `deviceScaleFactor: 1`:
128×128 for the icon, 1280×800 for screenshots, 440×280 for the small promo
tile, and 1400×560 for the marquee. The website copy renders the room shot at
`deviceScaleFactor: 2` and crops it to the player and popup; the rail
close-ups render the same way on a 700px canvas, just above the width at which
`screens.css` narrows the rail.
The store icon uses the approved vector mark inside a dark rounded square in
the design system's colors. The mark has enough clearance for a circular crop,
and the canvas has 16px transparent padding. The script fails rather than
emitting a half-drawn frame if a font or image did not load.

## Regenerating the imagery

`assets/` holds the three generated PNGs the shots use: a 2048×1152 "episode"
still (`show-frame-a.png`) and two 1024×768 webcam portraits (`cam-you.png`,
`cam-alex.png`). They were produced with the Codex CLI's built-in `image_gen`
tool:

```sh
codex exec -s workspace-write - < prompts.txt
```

`prompts.txt` is kept in this directory. It also asks for a second episode
still and two more portraits, which no shot uses and which are not committed;
running it regenerates all six, the committed three included, so expect the
shots to change. Constraints worth preserving if you regenerate: no text,
logos or watermarks anywhere in frame; no resemblance to real public figures
or to any existing show; the two fantasy episode stills must read as the same
series but different scenes, with composition weighted to the left so the room
popup does not cover the characters.
