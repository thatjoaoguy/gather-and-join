---
title: Diagnostics
sidebar_position: 4
---

# Diagnostics

There is no analytics or telemetry: five people in one household do not need a
funnel, and the privacy claim (the server sees room metadata and signaling
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
  `join_rejected`, `content_set`, `navigate`, `navigate_rejected`, `episode_start`, `stall`,
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

## Server environment

The variables a host might set are listed under
[Other places it can run](/docs/host-a-server#other-places-it-can-run). Two more
exist for development: `WATCH_URL_TEMPLATE` builds a watch URL from a content id
when neither the client nor `watchUrlFor` in `packages/shared` knows one (the
harness sets it to the fake player, e.g. `http://localhost:4173/watch/{contentId}`),
and `GJ_VERSION` is the version `/` and `/health` report in a development run;
the packaged builds bake it in. The header comment in `apps/server/src/index.ts`
is the full list.
