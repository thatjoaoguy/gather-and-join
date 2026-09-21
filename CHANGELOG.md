# Changelog

# [0.5.0](https://github.com/thatjoaoguy/gather-and-join/compare/v0.4.1...v0.5.0) (2026-09-21)


### Features

* **extension:** guide a first run through microphone, camera and server ([#33](https://github.com/thatjoaoguy/gather-and-join/issues/33)) ([960bea7](https://github.com/thatjoaoguy/gather-and-join/commit/960bea73261a494364f8c83ecf926b82ad1797ea))

## [0.4.1](https://github.com/thatjoaoguy/gather-and-join/compare/v0.4.0...v0.4.1) (2026-09-21)


### Bug Fixes

* **harness:** derive the test server endpoints once ([#32](https://github.com/thatjoaoguy/gather-and-join/issues/32)) ([18c18b8](https://github.com/thatjoaoguy/gather-and-join/commit/18c18b808c177179182c843a16a1db66e06347bd))

# [0.4.0](https://github.com/thatjoaoguy/gather-and-join/compare/v0.3.1...v0.4.0) (2026-09-21)


### Features

* **extension:** show the room connection on the toolbar icon ([#31](https://github.com/thatjoaoguy/gather-and-join/issues/31)) ([e7f467f](https://github.com/thatjoaoguy/gather-and-join/commit/e7f467f7974079be2ca7f984248f233b7dd90a68))

## [0.3.1](https://github.com/thatjoaoguy/gather-and-join/compare/v0.3.0...v0.3.1) (2026-09-20)


### Bug Fixes

* **server:** label the plain-text pages as utf-8 ([#27](https://github.com/thatjoaoguy/gather-and-join/issues/27)) ([1a4cab9](https://github.com/thatjoaoguy/gather-and-join/commit/1a4cab9de2bce0417d0b7930e4d612b0915ff0bc))

# [0.3.0](https://github.com/thatjoaoguy/gather-and-join/compare/v0.2.0...v0.3.0) (2026-09-20)


### Bug Fixes

* **ci:** grant packages:write through the whole release chain ([#21](https://github.com/thatjoaoguy/gather-and-join/issues/21)) ([17f87c6](https://github.com/thatjoaoguy/gather-and-join/commit/17f87c6885ba86a449b9363ff30212901da10d06))


### Features

* **server:** ship the server as a container image and a single file ([#20](https://github.com/thatjoaoguy/gather-and-join/issues/20)) ([8cec21f](https://github.com/thatjoaoguy/gather-and-join/commit/8cec21f600da457dfc5fe3451f45b2082183cb6f))

# [0.2.0](https://github.com/thatjoaoguy/gather-and-join/compare/v0.1.2...v0.2.0) (2026-09-20)


### Features

* add Google Drive as a streaming provider ([#17](https://github.com/thatjoaoguy/gather-and-join/issues/17)) ([f98a226](https://github.com/thatjoaoguy/gather-and-join/commit/f98a22644b4906a288ca11ed2779246bdb7f685d))

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
