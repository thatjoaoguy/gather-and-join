# Chrome Web Store listing

The text and assets the Developer Dashboard asks for, kept next to the code so
they stay in step with it. Copy from here at submit time. Not shipped in the ZIP.

## Submitting

- Build the ZIP with `pnpm --filter @gaj/extension exec wxt zip` (output in
  `apps/extension/.output/*.zip`) with `GAJ_TEST` unset. Never zip the repository.
- Load the production ZIP unpacked and smoke-test: popup, setup page, create and
  join, microphone grant, episode change. Check the service-worker console.
- The store rejects any upload whose version is not strictly higher than the last
  one it accepted, including rejected submissions. Bump the patch digit on every
  re-upload; WXT reads the version from `apps/extension/package.json`.
- Adding a streaming service later adds a host permission, which disables the
  extension for existing users until they accept it. Announce it.

## Store listing

**Extension name**
Gather & Join

**Short description**
Watch together in sync, with voice and video, on HBO Max. Each viewer uses their own subscription.

**Detailed description**

Gather & Join keeps a small group in sync while they watch the same episode on HBO Max, and adds a voice call (video optional) so it feels like one room.

Currently works with HBO Max. More services are on the way.

What it does
Play, pause, and seek are shared: when anyone presses play, everyone plays. If someone's stream buffers, the room pauses and the popup says who. When the room leader changes episodes, everyone is taken to the same one. A voice call runs alongside the show and survives episode changes. Camera is opt-in, and small video tiles appear over the player when it is on. An optional setting lowers the show's volume while you speak.

How to use it
1. One person hosts the companion server (included in the project, open source) at an address everyone can reach, and shares that address. Each participant enters it once on the extension's setup page.
2. Open an episode on HBO Max, click the extension, and press Create room. Read out the six-character code.
3. Everyone else clicks the extension, types the code, and presses Join. If they are on a different episode, one button takes them to the right one.
4. Use headphones. Echo cancellation is tuned for the call, not for a show playing out of speakers.

Privacy
Your video and audio go directly between the people in the room, never through a server. The companion server sees only your chosen display name, the room code, which episode the room is on, and the play/pause position. Nothing is recorded, nothing is sold, and there are no analytics. Playback of the show itself is untouched: every viewer streams from their own HBO Max account as usual.

Support
Questions and bug reports: https://github.com/thatjoaoguy/gather-and-join/issues

Gather & Join is independent software and is not affiliated with, endorsed by, or sponsored by HBO Max or Warner Bros. Discovery. HBO Max is a trademark of its owner. Each viewer needs their own HBO Max subscription.

**Category**
Social & Communication

**Single purpose**
Synchronizes playback and adds a voice call for a group watching a streaming service together.

**Primary language**
English

**Visibility**
Unlisted (install by link; can be switched to Public from the dashboard without re-review). All regions.

**Support URL**
https://github.com/thatjoaoguy/gather-and-join/issues

**Homepage URL**
https://thatjoaoguy.github.io/gather-and-join/

**Privacy policy URL**
https://thatjoaoguy.github.io/gather-and-join/privacy (the policy text is `src/pages/privacy.md`
on the `docs` branch; it covers peer IP visibility, the Google STUN server, and the diagnostics paste)

## Graphics

| Asset | Dimensions | Source |
|-------|-----------|--------|
| Store icon (required) | 128×128 PNG | `docs/design-system/brand/icon-128.png` (512 px also available) |
| Screenshot 1 (required) | 1280×800 | the popup open over a playing episode: peer list, mic and camera buttons, video tiles over the player |
| Screenshot 2 | 1280×800 | the join flow: name, code, and the "watching another episode, go there" prompt |
| Screenshot 3 | 1280×800 | the setup page: microphone and camera grants, ducking, server address |
| Small promo tile | 440×280 | `docs/design-system/brand/lockup.svg` on `#101014` |

Screenshots may show the extension over a real HBO Max page. Blur or crop episode
artwork, show the tiles rather than the show, and never use the HBO Max logo as a
standalone element or anything that looks like an official HBO screen.

## Permission justifications

| Permission | Type | Justification |
|------------|------|---------------|
| `tabs` | permissions | Read the URL of the HBO Max tab to know which episode the room is on, open the room's episode when a joiner is on a different one, and switch the user to that tab. |
| `webNavigation` | permissions | Detect when the user moves between episodes inside HBO Max (in-app navigation without a full page load) so the room follows the leader's episode change. Filtered to play.hbomax.com only. |
| `scripting` | permissions | Re-inject the player script into HBO Max tabs that were already open when the extension was installed or updated, so the user does not have to reload. |
| `offscreen` | permissions | Keep the voice call and the room connection alive while the user navigates between episodes. Audio playback and peer connections cannot survive page navigation otherwise. |
| `storage` | permissions | Save the user's display name, the companion server address, and the voice-ducking preference on the device. |
| `https://play.hbomax.com/*` | host_permissions | The only site the extension operates on: it reads and controls the video player's play/pause/position and draws the participant tiles over it. |

The production build contains no localhost or 127.0.0.1 host permissions; those
exist only in the `GAJ_TEST=1` build for the test harness.

## Data use disclosure

**Does the extension collect user data?** Yes, transmitted to a user-chosen server; none retained by the developer.

| Data type | Collected? | Transmitted off-device? | Purpose | Shared with third parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Yes: user-typed display name (≤24 chars) | Yes, to the companion server chosen by the user and to the other peers in the room | Show who is in the room | No |
| Health info | No | | | |
| Financial info | No | | | |
| Authentication info | No | | | |
| Personal communications | Yes: microphone and (opt-in) camera streams | Yes, peer-to-peer between room members only; never through a server; never recorded | Voice/video call | No |
| Location | No | | | |
| Web history | No | | | |
| User activity | Yes: play/pause/seek events and playback position | Yes, to the companion server and room peers | Keep playback in sync | No |
| Website content | Yes: the episode identifier from the HBO Max page URL | Yes, to the companion server and room peers | Take everyone to the same episode | No |

Notes for the form: the server is hosted by the users themselves, not operated by the
developer. No `chrome.storage.sync` (nothing goes to Google). No analytics, no telemetry,
no crash reporting, no remote code.

Certifications: data is not sold to third parties, not used for purposes unrelated to
the extension's core functionality, and not used for creditworthiness or lending.

## Notes for reviewers

> This extension needs two things the reviewer may not have: an HBO Max subscription and a running companion server.
> Test server: wss://[fill in before submitting; keep it up for the review window]
> Steps: install → open the extension's setup page → paste the server address → Save. Open any episode on play.hbomax.com → click the extension → Create room. A second browser profile can Join with the six-character code; play/pause on one follows on the other.
> Without a subscription, the same flow can be seen on the demo video: [link]
> Microphone and camera are requested only when the user clicks Allow on the setup page; they are never recorded and never touch a server.

Known limitations to expect during review: a fresh install does nothing until a server
address is configured, and ad-supported HBO Max tiers desync during ad breaks (the room
re-converges afterwards).

## Repository steps

- Push the `docs` branch, then Settings → Pages → Source: **GitHub Actions**. The
  `deploy-docs` workflow publishes on every push to `docs`; the privacy policy URL
  above then resolves.
- Tag `v0.1.0` at the submitted commit and attach the store ZIP to the release.
