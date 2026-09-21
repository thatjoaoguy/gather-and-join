# apps/extension — agent guide

WXT + TypeScript MV3 extension. Five contexts with five different lifetimes; the
split exists so the voice call survives an episode change. Root `AGENTS.md` first.

## Layout

```
entrypoints/        wiring only — no behaviour lives here
  background.ts       service worker: offscreen keep-alive, navigation detection, storage proxy, toolbar badge
  offscreen/          the long-lived context: RoomSession, WebSocket, every RTCPeerConnection, mic, remote audio
  player.content.ts   dies on every navigation: <video> binding, drift correction, the sidebar
  popup/ options/     UI, built fresh on every open
  testhook.content.ts GJ_TEST=1 builds only
lib/                behaviour, as classes with injected collaborators
  providers/          DOM-level provider knowledge (PlayerAdapter)
  sidebar/            the in-page HUD: view, page layout, loopback receiver
  ui/                 styles and icons shared by popup and options
test/               vitest; fakes.ts has the RTCPeerConnection / WebSocket / track stand-ins
```

## Rules that bite

- **Put behaviour in `lib/`, not an entrypoint.** Constructor-inject whatever
  touches Chrome, the network or media, then it runs under vitest with a fake. An
  entrypoint is untestable by construction, so it gets no logic.
- **The offscreen document has no `chrome.storage`.** Use `lib/kv.ts`, which
  proxies through the service worker. Same for anything that needs a tab opened,
  and for the toolbar dot — `chrome.action` is the worker's alone, so the
  offscreen document reports a state and the worker draws it onto the icon with
  an `OffscreenCanvas` (`lib/badge.ts`).
- **The service worker holds no state that matters.** Chrome kills it whenever it
  likes; anything you keep there must be re-derivable on the next wake.
- **Content scripts cannot reach session storage.** Their diagnostics lines go over
  the player port to the offscreen document (`installLogSink` / `appendLogLine`).
- **Never pass a `MediaStream` between contexts.** Remote video goes to the page
  through the loopback pair (`lib/loopback-sender.ts` ⇄ `lib/sidebar/loopback-receiver.ts`).
- **Commands applied from the room are tagged** so their own `play`/`pause`/`seeking`
  echoes are not rebroadcast. If you add a way to drive the element, tag it too or
  you have built a feedback loop (the `echo-suppress` sabotage row exists for this).
- **`__GJ_TEST__` is a build-time constant.** The test hook and the sabotage flags
  must be unreachable in a normal build; `wxt.config.ts` also strips localhost
  matches from a production manifest.
- **Fonts and brand marks come from `docs/design-system` at build time.** Don't add
  copies under `public/`.

## Adding a provider

One entry in `packages/shared/src/providers.ts` (URL-level, DOM-free) and one
adapter in `lib/providers/` implementing `PlayerAdapter` (find the `<video>`, the
up-next panel). Register the adapter in `lib/providers/index.ts`. Nothing else in
the extension should learn which provider it is on — manifest matches, the content
script's `matches` and the worker's navigation filter are all derived.

## Verifying

```sh
pnpm --filter @gj/extension test:unit
pnpm --filter @gj/extension typecheck
pnpm --filter @gj/extension build        # → .output/chrome-mv3
pnpm --filter @gj/extension build:test   # GJ_TEST=1 → .output-test, what the harness loads
```

Anything about behaviour across contexts (navigation, worker death, reconnect)
is only really proven by `pnpm test:e2e` from the root — the unit fakes cannot
kill a service worker.
