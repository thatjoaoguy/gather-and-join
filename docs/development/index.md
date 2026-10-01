---
title: Development
slug: /development
---

# Development

Everything in this section is for people working on the code. The repository
is a pnpm workspace: a Chrome MV3 extension built with WXT and TypeScript, the
signaling server, and the code both share. There is no UI framework, and the
server has no bundler in development.

[`CONTRIBUTING.md`](https://github.com/thatjoaoguy/gather-and-join/blob/main/CONTRIBUTING.md)
is the process and the product decisions a change must preserve;
[`AGENTS.md`](https://github.com/thatjoaoguy/gather-and-join/blob/main/AGENTS.md)
routes a change to the code that owns it.

- [Architecture](/docs/development/architecture): the five pieces, who owns
  what, and the browser facts that shaped them.
- [Sync and the wire protocol](/docs/development/sync-and-protocol): the drift
  policy, echo suppression, ad breaks, and the frames worth knowing.
- [Testing](/docs/development/testing): the Playwright suite, fake media, and
  the sabotage matrix.
- [Diagnostics](/docs/development/diagnostics): the server's event log and the
  extension's ring buffers.

## Layout

| Path | What |
|---|---|
| `apps/extension` | WXT + TypeScript extension: content script, service worker, offscreen document, popup, options |
| `apps/server` | Node + `ws` signaling/sync server. One file. No database, no auth. Ships as a bundled `.mjs` and a container image — see its [`Dockerfile`](https://github.com/thatjoaoguy/gather-and-join/blob/main/apps/server/Dockerfile) |
| `packages/shared` | Wire protocol types, room reducer, clock/drift policy — imported by both sides |
| `tools/harness` | Fake player page, self-identifying fake media, observer client, multi-peer launcher, Playwright suite, sabotage matrix |

## Quick start

```sh
pnpm install
npx skills install                  # optional: agent skills pinned in skills-lock.json (Chrome extension + modern web guidance)
pnpm dev:server                     # ws://localhost:8080
pnpm dev:harness                    # fake player at http://localhost:4173
pnpm --filter @gj/extension build  # → apps/extension/.output/chrome-mv3
```

Load `apps/extension/.output/chrome-mv3` as an unpacked extension
(`chrome://extensions` → Developer mode → Load unpacked). Open the extension's
options page once to allow the microphone and set the server URL.

To watch the whole thing run without a subscription:

```sh
pnpm --filter @gj/extension build:test      # test build with the in-page hook
pnpm --filter @gj/harness launch 3          # 3 headed Chromes in one room on the fake player
```

## Look and feel

The UI follows the approved design system in `docs/design-system` (Quicksand,
round and playful, purple for Join and red for Create, dark only); the screens it
implements are `docs/design-system/screens/index.html`. The toolbar icons live in
`apps/extension/public`; fonts and the lockup are copied from the design system at
build time (`wxt.config.ts`). The participant HUD declares Quicksand in the host
document (a shadow root cannot), which is why `fonts/*` is web-accessible on player
hosts. Shared page styles live in `apps/extension/lib/ui`.
