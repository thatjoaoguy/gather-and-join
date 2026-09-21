# Chrome Web Store listing

The text and assets the Developer Dashboard asks for, kept next to the code so
they stay in step with it. Copy from here at submit time. Not shipped in the ZIP.

## Submitting

- Download the ZIP from the GitHub release (`gather-and-join-X.Y.Z-chrome.zip`).
  The release workflow builds it with `GJ_TEST` unset and checks the manifest
  version. To build one by hand: `pnpm --filter @gj/extension exec wxt zip`
  (output in `apps/extension/.output/*.zip`). Never zip the repository.
- Load the production ZIP unpacked and smoke-test: popup, setup page, create and
  join, microphone grant, episode change. Check the service-worker console.
- The store rejects any upload whose version is not strictly higher than the last
  one it accepted, including rejected submissions. Every release bumps the
  version, so re-upload a new release rather than a rebuilt ZIP; to get one
  after a rejection, merge the fix as a `fix:` commit.
- Adding a streaming service later adds a host permission, which disables the
  extension for existing users until they accept it. Announce it.

## Store listing

**Extension name**
Gather & Join

**Short description**
Watch together in sync, with voice and video, on HBO Max and Google Drive. Everyone plays from their own account.

**Detailed description**

Gather & Join keeps a small group in sync while they watch the same thing on HBO Max or Google Drive, and adds a voice call (video optional) so it feels like one room.

Works with HBO Max and with video files on Google Drive. More services are on the way.

What it does
Play, pause, and seek are shared: when anyone presses play, everyone plays. If someone's stream buffers, the room pauses and the popup says who. When the room leader changes episodes, everyone is taken to the same one. A voice call runs alongside the show and survives episode changes. Camera is opt-in, and small video tiles appear over the player when it is on. An optional setting lowers the show's volume while you speak.

How to use it
1. One person hosts the companion server (included in the project, open source) at an address everyone can reach, and shares that address. Each participant enters it once on the extension's setup page.
2. Open an episode on HBO Max, or a video file on Google Drive, click the extension, and press Create room. Read out the six-character code.
3. Everyone else clicks the extension, types the code, and presses Join. If they are on a different episode, one button takes them to the right one.
4. Use headphones. Echo cancellation is tuned for the call, not for a show playing out of speakers.

Privacy
Your video and audio go directly between the people in the room, never through a server. The companion server sees only your chosen display name, the room code, which episode the room is on, and the play/pause position. Nothing is recorded, nothing is sold, and there are no analytics. Playback itself is untouched: every viewer streams from their own HBO Max account, or their own Google Drive, as usual. The extension never downloads, copies, or relays the video.

Support
Questions and bug reports: https://github.com/thatjoaoguy/gather-and-join/issues

Gather & Join is independent software and is not affiliated with, endorsed by, or sponsored by HBO Max, Warner Bros. Discovery, or Google. HBO Max and Google Drive are trademarks of their owners. Each viewer needs their own HBO Max subscription, and for Drive the file must be shared with each viewer's own Google account.

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
| `tabs` | permissions | Read the URL of the player tab to know which episode or file the room is on, open it when a joiner is elsewhere, and switch the user to that tab. |
| `webNavigation` | permissions | Detect when the user moves between episodes inside HBO Max (in-app navigation without a full page load) so the room follows the leader's change. Filtered to play.hbomax.com and drive.google.com only. |
| `scripting` | permissions | Re-inject the player script into player tabs that were already open when the extension was installed or updated, so the user does not have to reload. |
| `offscreen` | permissions | Keep the voice call and the room connection alive while the user navigates between episodes. Audio playback and peer connections cannot survive page navigation otherwise. |
| `storage` | permissions | Save the user's display name, the companion server address, and the voice-ducking preference on the device. |
| `https://play.hbomax.com/*` | host_permissions | One of the two sites the extension operates on: it reads and controls the video player's play/pause/position and draws the participant tiles over it. |
| `https://drive.google.com/file/*` | host_permissions | Same purpose, for Drive-hosted video. Deliberately scoped to the file viewer path: the extension does not run on My Drive, Docs, Sheets, the file picker, or anywhere else in Drive, and it neither reads nor transmits file contents, names, or any other Drive data. The only thing it takes from the page is the file id already visible in the URL. |

The production build contains no localhost or 127.0.0.1 host permissions; those
exist only in the `GJ_TEST=1` build for the test harness.

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
| Website content | Yes: the episode identifier from the HBO Max page URL, or the file id from the Google Drive URL | Yes, to the companion server and room peers | Take everyone to the same episode or file | No |

Notes for the form: the server is hosted by the users themselves, not operated by the
developer. No `chrome.storage.sync` (nothing goes to Google). No analytics, no telemetry,
no crash reporting, no remote code.

Certifications: data is not sold to third parties, not used for purposes unrelated to
the extension's core functionality, and not used for creditworthiness or lending.

## Notes for reviewers

> This extension needs a running companion server, and for the HBO Max flow a subscription. The Google Drive flow needs neither: any video file in the reviewer's own Drive works.
> Test server: wss://[fill in before submitting; keep it up for the review window]
> Steps: install (the setup page opens by itself; it is also reachable from the extension) → allow the microphone → paste the server address → Save. Open any episode on play.hbomax.com, or any video file at drive.google.com/file/d/<id>/view → click the extension → Create room. A second browser profile can Join with the six-character code; play/pause on one follows on the other. For the Drive flow the file must be shared with the second profile's Google account.
> Without a subscription, the same flow can be seen on the demo video: [link]
> Microphone and camera are requested only when the user clicks Allow on the setup page; they are never recorded and never touch a server.

Known limitations to expect during review: a fresh install cannot join anything until a
server address is configured — the setup page opens on install and says which of the three
steps are outstanding, and the popup offers the same until one is saved. Ad-supported HBO
Max tiers desync during ad breaks (the room re-converges afterwards). On Google Drive, a
link opened without an account hint resolves to the viewer's first Google account, so on
a profile signed into several accounts the "Go to episode" button may show "Unable to
load video" — opening the file URL directly works. Drive also rate-limits a single file
streamed by several viewers at once; that is a Drive quota, not an extension fault.

## Repository steps

- Push the `docs` branch, then Settings → Pages → Source: **GitHub Actions**. The
  `deploy-docs` workflow publishes on every push to `docs`; the privacy policy URL
  above then resolves.
- Releases are tagged `vX.Y.Z` with the store ZIP attached by the release
  workflow; `v0.1.0` was tagged by hand at the first submission.
