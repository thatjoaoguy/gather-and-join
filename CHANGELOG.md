# Changelog

## [0.1.2](https://github.com/thatjoaoguy/gather-and-join/compare/v0.1.1...v0.1.2) (2026-09-20)


### Bug Fixes

* **rtc:** keep early ICE candidates, and make the e2e suite deterministic ([#3](https://github.com/thatjoaoguy/gather-and-join/issues/3)) ([a146088](https://github.com/thatjoaoguy/gather-and-join/commit/a1460887287a7d9b6b1ecc9a717c628225029f3f))

## [0.1.1](https://github.com/thatjoaoguy/gather-and-join/compare/v0.1.0...v0.1.1) (2026-09-19)


### Bug Fixes

* **extension:** stop a wedged service worker from silently breaking the popup and the room ([#4](https://github.com/thatjoaoguy/gather-and-join/issues/4)) ([ef8d781](https://github.com/thatjoaoguy/gather-and-join/commit/ef8d781bfa006bb79fed9be5636463c7fa6f27f4))

## [0.1.0](https://github.com/thatjoaoguy/gather-and-join/releases/tag/v0.1.0) (2026-09-19)

First unlisted Chrome Web Store submission.

### Features

* Synchronized play, pause, and seek for a room watching the same episode on HBO Max.
* Room codes (six characters), a leader who chooses the episode, and automatic
  leader hand-off when the leader leaves.
* Mesh voice call with camera opt-in; media flows directly between participants.
* In-page participant rail that survives episode changes and fullscreen.
* "Someone is buffering" pause with manual resume; off-episode notice with a
  one-click jump to the room's episode.
* Optional voice ducking (off by default).
* Self-hosted signaling server: one file, no database, no accounts.
* Setup page with device permissions, connection address, and a diagnostics
  report the user can copy by hand.
* Gather & Join design system v1.0 applied to the popup, setup page, and rail.
