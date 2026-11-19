---
title: Testing
sidebar_position: 3
---

# Testing

Everything below runs without any streaming subscription, headless, unattended.

```sh
pnpm verify              # lint → typecheck → unit → e2e (clean) → e2e sabotage matrix
pnpm test:unit           # shared reducer/policy + server integration
pnpm test:e2e            # Playwright: N Chromes with the test build, fake player, fake media
pnpm test:sabotage       # each flag disables one mechanism; its guarding test must fail, the rest pass
GJ_SABOTAGE=drift pnpm test:e2e    # one sabotage run by hand
GJ_REUSE_SERVERS=1 TEST_SERVER_PORT=8080 TEST_PLAYER_PORT=4173 pnpm test:e2e   # against your own dev servers
```

The Playwright suite spins up the server on `:18080` and the fake player on
`:14173` (high ports so a dev server on 8080 never collides), launches one
Chromium per peer with `--use-fake-device-for-media-stream` fixtures — a distinct
sine per peer (440/554/659/784 Hz) and a distinct solid colour — and asserts
numbers: pairwise position spread from a headless observer's ground-truth frame
log, hard-seek and re-attach counters, per-peer peak frequency bin, sampled pixel
colour, `framesDecoded`, `video.volume`.

`make -C tools/harness fixtures` builds the full fixtures with ffmpeg (labels
burned into the video, a 5.5-minute test-pattern source for the fake player).
When they are absent the suite writes minimal in-process equivalents, so ffmpeg is
optional.

The sabotage rows run concurrently, each on its own ports and Playwright output
directory (`GJ_SABOTAGE_PARALLEL`, default 4; set 1 on a small machine): about
3.5 minutes for the matrix on a 14-core laptop, 7 in sequence. Each row's full
Playwright output is in `tools/harness/test-results/sabotage-logs/<flag>.log`.
Sabotage runs cap every test at 100 s (the slowest passing one takes ~40 s) and
skip the failure dump for tests the matrix expects to fail: under `echo-suppress`
the peers feed each other an unbounded seek storm that jams their pages, and the
dump's calls would each wait out their own timeouts against it.

## Sabotage flags

| flag | disables | must fail |
|---|---|---|
| `reattach` | `MutationObserver` re-wiring of a recreated `<video>` | element re-attach, quality switch |
| `drift` | the dead zone / rate band (everything hard-seeks) | small drift |
| `offscreen` | the offscreen document's persistence across navigation | navigation survival, leader authority (both assert the room survives an episode transition). Service-worker termination is skipped under this flag: it kills the worker right before that navigation, and whether the restarting worker closes the document before the new content script reaches it is a race |
| `echo-suppress` | tagging of locally-applied remote commands | echo suppression, large drift, small drift, quality switch (the follower's own corrective seeks move the room), disney-shaped seek (the burst of the follower's applied seek reaches the room as pauses) |
| `episode-start` | the skip a longer copy applies from the room's episode start | episode start |

## Firefox

Playwright cannot load an extension into Firefox, so the suite and the matrix
drive Chrome only. The Firefox build has its own check:

```sh
pnpm --filter @gj/harness smoke:firefox
```

It drives a headless Firefox over WebDriver BiDi (`webExtension.install`), puts
it in a room with one Chrome peer from the harness, and checks the call both ways
(each side hears the other's tone), play and pause in both directions, the cameras
into the page tiles, the room surviving a reload, a client-side route and the
leader's episode change, Firefox's own play and pause reaching Chrome on the
Drive-shaped page, where the player is a facade over a cross-origin embed, and on
the Disney+-shaped page the page-world script reaching the facade, the two program
clocks agreeing, and a seek from Firefox's player controls reaching Chrome. It needs a local Firefox (`FIREFOX_BIN` to point at
another) and runs the server on `:8080`, the extension's default, because a
Firefox peer cannot be pointed at a test server: automation cannot open its
`moz-extension://` pages.

It keeps permission checks on, with the microphone and camera already allowed the
way the setup page leaves them. With them switched off, it once passed while
nobody in a real Firefox could hear you: Firefox refuses `getUserMedia` in a
background page whatever the permission, which only shows with the checks on.
