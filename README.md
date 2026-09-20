# Gather & Join

[![release](https://github.com/thatjoaoguy/gather-and-join/actions/workflows/release.yml/badge.svg)](https://github.com/thatjoaoguy/gather-and-join/actions/workflows/release.yml)

Watch together in sync, with voice and video. Gather & Join is a Chrome
extension that keeps a small group on the same second of the same episode and
adds a call alongside the show, plus a small server one of you hosts.
Guide and privacy policy: [thatjoaoguy.github.io/gather-and-join](https://thatjoaoguy.github.io/gather-and-join/).

Every participant streams from their own account through the service's own
player. **No media ever goes through the server**: it sees room metadata and
call-setup messages only. Gather & Join is independent software and is not
affiliated with, endorsed by, or sponsored by any streaming service (see
[Legal](#legal)).

## Supported services

- HBO Max
- Google Drive — for video files you own or that are shared with you

Drive is not a subscription service, so two things work differently. The file
must be shared with **every** participant's Google account, and Drive rate-limits
a single file streamed by several people at once ("Sorry, you can't view or
download this file at this time"), which is exactly the situation a watch party
creates. An accepted limitation: an unqualified Drive link opens under the viewer's
*first* Google account, so on a profile signed into several accounts the popup's
**Go to episode** button can land on "Unable to load video". Open the file's URL
directly in that case. This is not planned for a fix — the account index is
per-profile, so there is no single index the room could hand out that is right
for everyone in it.

More are planned. Adding one is a provider entry plus an adapter; see
[Streaming providers](#streaming-providers).

## Getting started

1. **Someone hosts the server.** One person in the group runs it and shares its
   address. See [Hosting the server](#hosting-the-server).
2. **Everyone installs the extension.** From the Chrome Web Store link the host
   shares (the listing is unlisted for now), or by building it yourself (see
   [Development](#development)).
3. **Set it up once.** Click the extension, open **Connection & device setup**,
   allow the microphone (camera optional), paste the server address, save.

## Using it

1. One person opens the episode on a supported service, clicks the extension,
   **Create room**, and reads out the 6-character code.
2. Everyone else clicks the extension, types the code, **Join**. If they are not on
   the room's episode, the popup shows one button that takes them there.
3. Anyone can play, pause, or seek. Only the room host (the creator; passed to the
   oldest remaining peer if they leave) can change episodes — everyone follows.
   The popup's lobby shows whether your microphone, camera and server are ready
   before you join; the eye next to the server address hides it for screen sharing.
4. Mic is on by default, camera is opt-in. **Use headphones**: echo cancellation is
   tuned for the call, not for the show coming out of your speakers. Voice ducking
   (lowering the show while you talk) is **off by default** — it's a checkbox on the
   setup page, because with speakers the show itself keeps triggering it.

If someone buffers, the room pauses and the popup says who. Resume is a manual
press — there is no auto-resume, on purpose (it thrashes).

## Hosting the server

One person in the group runs the server and shares its address; everyone else
pastes that address into the extension's setup page once. It holds room state in
memory, stores nothing on disk, and never sees any video.

**The short version: deploy the published image on Render's free tier.** It costs
nothing, needs no credit card, and gives an address that does not change between
parties — so everyone pastes it once, ever.

1. At [dashboard.render.com](https://dashboard.render.com), choose **New → Web
   Service**, then the **Existing Image** tab, and paste
   `ghcr.io/thatjoaoguy/gather-and-join-server:latest`.
2. Name it something only your group would guess; the name becomes the address.
3. Under **Compute**, select the **$0/month Free** plan — Render pre-selects the
   $7 one.
4. Under **Advanced**, set **Health Check Path** to `/health`. The field suggests
   `/healthz`, which this server does not answer.
5. Deploy, then open the address Render gives you. A running server says so in
   plain text.
6. Share that address with `wss://` in place of `https://`.

The [hosting guide](https://thatjoaoguy.github.io/gather-and-join/docs/host-a-server)
walks through the same steps with screenshots, and covers what the free tier's
sleep does and does not mean. Short answer: it cannot sleep mid-party, and waking
takes about 12 seconds.

### The other two ways

- **[From your own machine](https://thatjoaoguy.github.io/gather-and-join/docs/host-on-your-machine)**
  — `pnpm host` runs the server behind a Cloudflare quick tunnel and prints the
  `wss://` URL. Good for one evening; the address changes every run and the room
  ends when the laptop sleeps.
- **[On your local network](https://thatjoaoguy.github.io/gather-and-join/docs/host-on-your-network)**
  — everyone on the same Wi-Fi, sharing `ws://<your-ip>:8080`. Nothing is exposed
  to the internet.

### Running it anywhere else

The server is one Node program with no database and nothing on disk. It ships as
a container image and as a single file, so it runs on anything with **Docker** or
**Node ≥ 22.6**:

```bash
docker run -d --restart unless-stopped -p 8080:8080 \
  ghcr.io/thatjoaoguy/gather-and-join-server:latest

node gather-and-join-server-0.3.1.mjs     # from the latest release
```

Wherever it runs it needs port `8080` (or `PORT` set to match), `/health` as the
health check, and **exactly one copy** — rooms live in one process's memory, so a
second copy silently splits the party in two under the same room code.

Use `wss://` for anything beyond the local network: signaling carries display
names and room codes, and only TLS keeps them private in transit. Plain `ws://`
to a LAN address is fine (Chrome does not apply mixed-content blocking to
extension pages).

### What hosting commits you to

The room lives on that machine: if it stops, the room is gone. The person hosting
is responsible for keeping it up for the length of the party.

Environment variables: `PORT` (default 8080), `ROOM_TTL_MS` (how long an empty
room is kept), `LEADER_GRACE_MS`, `HEARTBEAT_MS`, `GJ_LOG=0` to silence the event
log. The server prints one `key=value` line per room event to stdout and keeps no
other record.

## Known unsolvable

On ad-supported tiers, ad breaks land at different points per viewer, so
`currentTime` is not comparable across the room mid-break. The extension does
not skip, hide, mute, or shorten ads — they play exactly as the service serves
them — so there is no fix; the room re-converges after the break. Two small guards keep a break
from doing worse than desync: an element whose duration ends far before the
room's position (an ad clip) never pauses the room when it ends, and an `ended`
is only broadcast if the element is still current a second later (players swap
the element right after an ad).

## Legal

Gather & Join is independent software. It is not affiliated with, endorsed by,
or sponsored by any streaming service. Service names are trademarks of their
respective owners and are used here only to identify the sites the extension
works with.

What it does and does not do:

- Every viewer needs their own subscription and watches through the service's
  own player, signed in to their own account. The extension never handles
  credentials, cookies, or session tokens.
- It operates only the standard player controls a viewer already has (play,
  pause, seek, volume, cancel autoplay), hides the autoplay countdown on
  non-leaders, and draws its own participant tiles over the page.
- It does not capture, record, download, re-stream, or redistribute any video or
  audio from the service. Remote media in the call is the participants' own
  microphones and cameras, exchanged directly between them.
- It does not circumvent DRM, region restrictions, concurrent-stream limits,
  or advertising. Ads play as served.
- The signaling server carries display names, room codes, an episode identifier,
  and playback position — nothing else — and stores nothing on disk.

Use of a streaming service through this extension remains subject to that
service's terms; each viewer is responsible for their own account. The software
is released under the [MIT License](./LICENSE) and provided as is, without
warranty of any kind.

## Development

Everything below is for people working on the code.

### Layout

| Path | What |
|---|---|
| `apps/extension` | WXT + TypeScript extension: content script, service worker, offscreen document, popup, options |
| `apps/server` | Node + `ws` signaling/sync server. One file. No database, no auth. Ships as a bundled `.mjs` and a container image — see [`Dockerfile`](./apps/server/Dockerfile) |
| `packages/shared` | Wire protocol types, room reducer, clock/drift policy — imported by both sides |
| `tools/harness` | Fake player page, self-identifying fake media, observer client, multi-peer launcher, Playwright suite, sabotage matrix |

### Quick start

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

### How it stays in sync

- The server is the clock. Each client estimates its offset with 5 ping/pong round
  trips (lowest RTT wins), re-run every 60 s and whenever a peer connection comes up.
- The leader heartbeats position every 5 s while playing.
- Each client compares local position to the room's expected position every 250 ms:

  | drift | action |
  |---|---|
  | < 250 ms | nothing |
  | 250–1500 ms | `playbackRate` nudge, held until < 100 ms |
  | ≥ 1500 ms | hard seek |

  The nudge scales with drift (`|drift|/4000`, clamped to 3 %–20 %) rather than a
  fixed 3 %: 3 % cannot correct 800 ms inside the 8 s the tests allow (it would
  take ~22 s). Below ~200 ms of drift it is a gentle 3 %.
- Commands we apply from the room are tagged so their own `play`/`pause`/`seeking`
  echoes are not rebroadcast (500 ms, per event kind — a genuine user action of a
  different kind inside that window still propagates).

### Architecture (why five pieces)

The voice call must survive episode changes, so nothing long-lived may live in a
context that dies on navigation:

| Component | Lifetime | Owns |
|---|---|---|
| Content script | dies on every navigation | `<video>` binding, local player events, drift correction, the party sidebar |
| Service worker | killed at will by Chrome | navigation detection, offscreen keep-alive, storage proxy |
| Offscreen document | survives everything | the `RoomSession` (room state, rejoin logic), the WebSocket, every `RTCPeerConnection`, mic, remote audio playback |
| Popup | open/close at will | create/join, mic/camera toggles, peer list |
| Server | long-running | room registry, authoritative sync state, signaling relay |

Two facts discovered while building that shape the code:

- **Provider specifics** (the first adapter, inspected live): the app is
  `play.hbomax.com`, watch URLs are `/video/watch/<uuid>`, `currentTime` seeks cleanly,
  and the up-next panel auto-advances 20 s *before* the episode ends unless its
  viewer presses its own "Cancel autoplay" button. On non-leaders the extension
  presses that same control on the viewer's behalf and hides the countdown
  panel, so the room stays on one episode until the leader moves it.
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
- **Offscreen documents have no `chrome.storage`** (only `chrome.runtime`). Anything
  the offscreen document persists or reads from storage goes through the service
  worker (`lib/kv.ts`).
- **Media cannot cross extension contexts.** Remote audio therefore plays inside the
  offscreen document (which is what lets the call survive navigation), and remote
  *video* is re-streamed to the page's tiles over a local loopback
  `RTCPeerConnection` (`lib/loopback-sender.ts` in the offscreen document,
  `lib/sidebar/loopback-receiver.ts` in the page).

#### Modules

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
| `sidebar/party-sidebar.ts` | composes `SidebarView` (DOM), `PageLayout` (making room), `LoopbackReceiver` | the port, the provider's video locator |
| `participants.ts` | the one derivation of "who is in the room", used by the popup and the sidebar | — |
| `sync-engine.ts`, `video-binding.ts`, `ducking.ts`, `up-next.ts` | per-page playback behaviour | a video locator, callbacks |

#### Streaming providers

Provider knowledge is split in two, both keyed by provider id:

- `packages/shared/src/providers.ts` — URL level (hosts, content-id parsing,
  watch URLs). Imported by the server too, so it is DOM-free. The manifest's
  host permissions, the content script's `matches` and the service worker's
  navigation filter are all derived from it.
- `apps/extension/lib/providers/` — DOM level (`PlayerAdapter`: how to find the
  `<video>`, the up-next panel selectors).

Adding a provider means one entry in each and a rebuild; nothing else knows
which provider it is running on.

### Look and feel

The UI follows the approved design system in `docs/design-system` (Quicksand,
round and playful, purple for Join and red for Create, dark only); the screens it
implements are `docs/design-system/screens/index.html`. The toolbar icons live in
`apps/extension/public`; fonts and the lockup are copied from the design system at
build time (`wxt.config.ts`). The participant HUD declares Quicksand in the host
document (a shadow root cannot), which is why `fonts/*` is web-accessible on player
hosts. Shared page styles live in `apps/extension/lib/ui`.

### Wire protocol

See `packages/shared/src/protocol.ts`. Four frames worth knowing beyond the obvious ones:
`join` carries `create: true` when the client is creating the room (the server
rejects collisions with `ROOM_EXISTS` and the client retries with a fresh code),
`playback` may carry `reason: 'stall'` so the popup can say who buffered, a `media`
frame carries a peer's self-reported mic/camera state (relayed to the others and
remembered for late joiners, so tiles can show who is muted), and a
`leader` frame announces a reassignment after the 60 s grace period a disconnected
leader is given (a rejoin with the same peer id within it keeps leadership; the
server evicts the stale socket).
Peer ids beginning with `obs:` are non-media observers (the harness) and are never
negotiated with.

### Testing

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

#### Sabotage flags

| flag | disables | must fail |
|---|---|---|
| `reattach` | `MutationObserver` re-wiring of a recreated `<video>` | element re-attach, quality switch |
| `drift` | the dead zone / rate band (everything hard-seeks) | small drift |
| `offscreen` | the offscreen document's persistence across navigation | navigation survival, leader authority (both assert the room survives an episode transition). Service-worker termination is skipped under this flag: it kills the worker right before that navigation, and whether the restarting worker closes the document before the new content script reaches it is a race |
| `echo-suppress` | tagging of locally-applied remote commands | echo suppression, large drift, small drift, quality switch (the follower's own corrective seeks move the room) |

### Diagnostics

There is no analytics or telemetry: five people in one household do not need a
funnel, and the privacy claim above (the server sees room metadata and signaling
frames only) is worth more than usage numbers. What there is instead:

- **Server event log.** One `key=value` line per room event on stdout, nothing for
  playback or signaling frames (stalls are the exception):

  ```
  2026-09-18T20:01:02.345Z room_created room=RM0001 peer=a3f9 name=Ana rooms=1
  2026-09-18T20:01:09.010Z peer_joined room=RM0001 peer=7c21 name=Ben peers=2 leader=a3f9
  2026-09-18T20:14:31.877Z stall room=RM0001 peer=7c21 name=Ben positionMs=812340
  2026-09-18T20:40:02.101Z peer_left room=RM0001 peer=7c21 name=Ben reason=heartbeat peers=1 leader=a3f9
  ```

  Events: `listening`, `room_created`, `peer_joined`, `peer_left` (with
  `reason=leave|close|error|heartbeat`), `peer_evicted`, `leader_changed`,
  `join_rejected`, `content_set`, `navigate`, `navigate_rejected`, `stall`,
  `signal_dropped`, `bad_message`, `room_expired`. `GJ_LOG=0` silences it.
- **Extension diagnostics.** Each extension realm (service worker, offscreen
  document, and every player page via the offscreen document) keeps a ring buffer
  of its last 400 events in `chrome.storage.session`: room frames in and out,
  socket status, peer connection state changes, mic/camera outcomes, video
  (re)attaches, every hard seek and rate nudge, and a drift summary every 30 s
  while playing (`drift 30s: n=118 p50=32ms max=410ms seeks=0 nudges=1`). The
  buffers survive Chrome restarting the worker or the offscreen document (a
  `--- restarted ---` marker separates incarnations) and are cleared when Chrome
  exits. The setup page's **Diagnostics** section shows the current room and peer
  states and has a **Copy diagnostics** button that assembles all of it, with peer
  byte counts, into one paste. Nothing is sent anywhere by itself.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development loop and the
product decisions a change must preserve, and [CHANGELOG.md](./CHANGELOG.md)
for what shipped. The project website and the privacy policy live on the
`docs` branch (a Docusaurus site deployed to GitHub Pages); the policy is
`src/pages/privacy.md` there.
