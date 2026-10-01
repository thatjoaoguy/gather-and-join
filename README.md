<p align="center">
  <a href="https://gatherandjoin.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/design-system/brand/lockup.svg">
      <img src="docs/design-system/brand/lockup-dark.svg" alt="Gather &amp; Join" width="320">
    </picture>
  </a>
</p>

<p align="center">
  <strong>Watch together in sync, with voice and video.</strong><br>
  Everyone plays from their own account. No media ever goes through the server.
</p>

<p align="center">
  <a href="https://github.com/thatjoaoguy/gather-and-join/actions/workflows/release.yml"><img src="https://github.com/thatjoaoguy/gather-and-join/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="https://github.com/thatjoaoguy/gather-and-join/releases/latest"><img src="https://img.shields.io/github/v/release/thatjoaoguy/gather-and-join?sort=semver&label=version&color=b9a0ff" alt="Latest version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-b9a0ff" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="https://gatherandjoin.com/docs/install"><strong>Install</strong></a> ·
  <a href="https://gatherandjoin.com/docs/host-a-server"><strong>Host a server</strong></a> ·
  <a href="https://gatherandjoin.com/docs/watch-together"><strong>Watch together</strong></a> ·
  <a href="https://gatherandjoin.com/docs/troubleshooting"><strong>Troubleshooting</strong></a>
</p>

<p align="center">
  <img src="https://gatherandjoin.com/img/room.webp" alt="A room in progress: the episode playing, the room popup with its invite code and three people connected, and webcam tiles for the call beside the player.">
</p>

Gather & Join is a Chrome extension that keeps a small group on the same second
of the same episode and puts a voice call alongside the show, plus a small
server one of you hosts. Each viewer watches through the service's own player,
signed in to their own account; voice and video go directly between you. The
server only sees room details and the messages that set up the call.

**Works with** HBO Max, YouTube, video files on Google Drive, and Wix Video, with
more on the way.

## How it works

1. **Someone hosts the server** and shares its address. It runs free on Render
   with no credit card. [Host a server →](https://gatherandjoin.com/docs/host-a-server)
2. **Everyone installs the extension** and pastes that address once.
   [Install →](https://gatherandjoin.com/docs/install)
3. **One person creates a room** on the episode and reads out the six-character
   code; everyone else joins. Anyone can play, pause or seek, and only the room's
   leader changes episodes. [Watch together →](https://gatherandjoin.com/docs/watch-together)

The mic is on when you join and the camera is opt-in. If someone buffers, the
room pauses until someone presses play again. Use headphones.

## Development

```sh
pnpm install
pnpm dev:server     # ws://localhost:8080
pnpm dev:harness    # fake player at http://localhost:4173
pnpm verify         # lint → typecheck → unit → build → e2e → sabotage matrix
```

The [development docs](https://gatherandjoin.com/docs/development) cover the
architecture, the sync policy and wire protocol, testing without a subscription,
and diagnostics. [CONTRIBUTING.md](./CONTRIBUTING.md) is the process and the
product decisions a change must preserve, [AGENTS.md](./AGENTS.md) is the guide
for coding agents, and [CHANGELOG.md](./CHANGELOG.md) is what shipped. The
website is built from the `docs` branch.

## Legal

Gather & Join is independent software. It is not affiliated with, endorsed by,
or sponsored by any streaming service, nor by any hosting provider named in this
documentation. Those names are trademarks of their respective owners and are used
here only to identify the sites the extension works with and the places the
server can be run. A provider is suggested because it happens to fit, not through
any arrangement, and nothing is received for naming it.

What it does and does not do:

- Every viewer needs their own access to what the room watches (their own
  subscription, where the service has one) and watches through the service's
  own player. The extension never handles credentials, cookies, or session
  tokens.
- It operates only the standard player controls a viewer already has (play,
  pause, seek, volume, cancel autoplay), hides the autoplay countdown on
  non-leaders, and draws its own participant tiles over the page.
- It does not capture, record, download, re-stream, or redistribute any video or
  audio from the service. Remote media in the call is the participants' own
  microphones and cameras, exchanged directly between them.
- It does not circumvent DRM, region restrictions, concurrent-stream limits,
  or advertising. Ads play as served.
- The signaling server carries display names, room codes, an episode identifier,
  the length of each viewer's copy of it, where the episode starts in a longer
  copy, and playback position — nothing else — and stores nothing on disk.

Use of a streaming service through this extension remains subject to that
service's terms; each viewer is responsible for their own account. The software
is released under the [MIT License](./LICENSE) and provided as is, without
warranty of any kind.
