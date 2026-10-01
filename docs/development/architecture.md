---
title: Architecture
sidebar_position: 1
---

# Architecture

The voice call must survive episode changes, so nothing long-lived may live in a
context that dies on navigation:

| Component | Lifetime | Owns |
|---|---|---|
| Content script | dies on every navigation | `<video>` binding, local player events, drift correction, the party sidebar |
| Service worker | killed at will by Chrome | navigation detection, offscreen keep-alive, storage proxy, the toolbar badge |
| Offscreen document | survives everything | the `RoomSession` (room state, rejoin logic), the WebSocket, every `RTCPeerConnection`, mic, remote audio playback |
| Popup | open/close at will | create/join, mic/camera toggles, peer list |
| Server | long-running | room registry, authoritative sync state, signaling relay |

Facts discovered while building that shape the code:

- **Provider specifics** (the first adapter, inspected live): the app is
  `play.hbomax.com`, watch URLs are `/video/watch/<uuid>`, `currentTime` seeks cleanly,
  and the up-next panel auto-advances 20 s *before* the episode ends unless its
  viewer presses its own "Cancel autoplay" button. On non-leaders the extension
  presses that same control on the viewer's behalf and hides the countdown
  panel, so the room stays on one episode until the leader moves it.
- **The page can hold more than one player, and one of them can be an ad.** On
  YouTube `querySelector('video')` is wrong twice over: the home feed's hover
  preview is a second `.html5-main-video`, and routing away from a watch page
  leaves the real player in the DOM, video still attached, inside a hidden
  `ytd-watch-flexy`. Both are excluded by scoping the lookup to a *visible*
  watch page. Ads are harder, because they play through the very same element:
  the adapter reports no video at all while the player carries `ad-showing`, so
  nothing is broadcast and nothing corrected, and the end of the break arrives
  as an ordinary re-attach — the path that already resyncs a fresh element to
  the room. No new machinery, and the ad itself is untouched.
- **YouTube's related-videos column is clipped, and that is accepted.** The
  sidebar takes its width out of the page, and the masthead, the player and the
  video's own column all move over, but the related-videos column does not and
  is clipped by about 60px. YouTube sizes that column from `100vh` and
  `window.innerWidth` rather than from its container —
  `--ytd-watch-flexy-sidebar-width` is a pixel value its own script computes for
  the full window — and an extension cannot change the window's width or make
  the site recompute against a narrower one (a synthetic `resize` does not do
  it). Fixing it would mean writing YouTube's private layout variables, which
  its next relayout overwrites. Deliberately left alone.
- **Not every player is a `<video>` you can reach.** Google Drive has no `<video>`
  in the page at all: playback runs in a cross-origin iframe on
  `youtube.googleapis.com`, reachable only through the YouTube widget
  postMessage protocol. `lib/providers/yt-embed-media.ts` wraps that protocol in
  the slice of `HTMLVideoElement` the rest of the code already speaks, so
  `SyncEngine` needed no changes. Position arrives as a pushed sample every
  ~266 ms and is dead-reckoned from the local clock in between; measured against
  the real element that estimate holds to a p95 of ~2 ms (see
  `tools/harness/src/embed-drift-probe.ts`), because the error comes from tick
  latency, not tick spacing.
- **A player can be a frame on a site the extension does not know.** Wix Video
  is an iframe on `embed.wix.com` inside a site of any domain, so matching the
  site is impossible and the player script is injected into every matching
  frame instead. `adapterForDocument` then keeps it only in the top document
  or, for an embedded provider, in a frame that is itself a watch page, so the
  other frames of a YouTube or HBO Max page stay empty. Whatever assumed the
  player was the tab follows from that: the worker's navigation watcher also
  accepts the player's frame, the popup finds the tab's player among its
  frames, and a guest's frame that the room sends somewhere a frame cannot go
  (HBO Max, YouTube) moves the whole tab instead.
- **Offscreen documents have no `chrome.storage`** (only `chrome.runtime`). Anything
  the offscreen document persists or reads from storage goes through the service
  worker (`lib/kv.ts`). The toolbar badge goes the same way for the same
  reason: `chrome.action` is out of reach there too, so the offscreen document
  reports a state and the worker paints it (`lib/badge.ts`).
- **Media cannot cross extension contexts.** Remote audio therefore plays inside the
  offscreen document (which is what lets the call survive navigation), and remote
  *video* is re-streamed to the page's tiles over a local loopback
  `RTCPeerConnection` (`lib/loopback-sender.ts` in the offscreen document,
  `lib/sidebar/loopback-receiver.ts` in the page).

## Modules

Entry points are wiring only; behaviour lives in `apps/extension/lib` as classes
with injected collaborators, so each runs under vitest with fakes
(`apps/extension/test/fakes.ts` has the `RTCPeerConnection`, `WebSocket` and
media-track stand-ins):

| Module | Owns | Injected |
|---|---|---|
| `room-session.ts` | the `Snapshot`, join/rejoin/error recovery, mesh wiring, media toggles, persistence | client, mesh factory, local/remote media, storage |
| `room-client.ts` | the WebSocket: reconnect/backoff, clock sync, rejoin | `WebSocket` global |
| `mesh.ts` + `perfect-peer.ts` | one negotiated `RTCPeerConnection` per peer | a send-signal callback |
| `loopback-sender.ts` / `sidebar/loopback-receiver.ts` | the two ends of the page loopback | signal callbacks |
| `sidebar/party-sidebar.ts` | composes `SidebarView` (DOM), `PageLayout` (making room), `LoopbackReceiver`, `EpisodeStartControl` | the port, the provider's video locator |
| `sidebar/episode-start.ts` | the "copies differ" notice: the proposal, nudges, align and clear | a send callback |
| `sidebar/settings-panel.ts` + `settings-model.ts` | the gear's room settings popover and what it shows | the sidebar's actions |
| `room-labels.ts` | how the connection, server and camera state are worded, shared by the popup and the settings panel | — |
| `copy-tracker.ts` | the length of this page's copy, held across element swaps and ad clips | a report callback |
| `participants.ts` | the one derivation of "who is in the room", used by the popup and the sidebar | — |
| `badge.ts` | the toolbar dot: which state the snapshot means, and the circle drawn onto the icon for it | a `chrome.action` slice, a canvas |
| `player-access.ts` | which services the user granted, the player script registered for exactly those, and the pages open when a grant or revocation lands | `chrome.permissions`, `chrome.scripting`, tab and frame lookups |
| `setup-state.ts` | the one derivation of "what is still to set up" — microphone, camera, address — shared by the popup's first run and the setup page | — |
| `sync-engine.ts`, `video-binding.ts`, `ducking.ts`, `up-next.ts` | per-page playback behaviour | a video locator, callbacks |

## Streaming providers

Provider knowledge is split in two, both keyed by provider id:

- `packages/shared/src/providers.ts` — URL level (hosts, content-id parsing,
  watch URLs). Imported by the server too, so it is DOM-free. The manifest's
  optional host permissions, the player script's `matches` and the service
  worker's navigation filter are all derived from it.
- `apps/extension/lib/providers/` — DOM level (`PlayerAdapter`: how to find the
  `<video>`, the up-next panel selectors, and whether the player is `embedded`,
  a widget other sites put in an iframe, as Wix Video is).

Adding a provider means one entry in each and a rebuild; nothing else knows
which provider it is running on. Every service is an optional host permission
the user grants from the popup the first time they watch there, so the
manifest has no required hosts and no `content_scripts` entry for the player:
the service worker registers the script at runtime for the granted services
(`lib/player-access.ts`). Adding a service therefore asks nothing of existing
users until they use it. An embedded provider's content script runs in
its widget's frame, and a frame gets a player only when it is itself a watch
page of an embedded provider (`adapterForDocument`).
