---
title: Sync and the wire protocol
sidebar_position: 2
---

# Sync and the wire protocol

The user-facing version is [How it stays in sync](/docs/how-it-stays-in-sync).
This is the policy behind it, with the numbers.

## Sync

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
- Positions are on the episode's own timeline. A copy with extras in front of the
  episode skips them: the room's `episodeStart` says where the episode starts in a
  copy of a given length, and a copy that matches it (within 5 s) adds that on the
  way in and takes it off on the way out, never broadcasting a position before 0.
- Commands we apply from the room are tagged so their own `play`/`pause`/`seeking`
  echoes are not rebroadcast (500 ms, per event kind — a genuine user action of a
  different kind inside that window still propagates).

## Ad breaks

On ad-supported tiers, ad breaks land at different points per viewer, so
`currentTime` is not comparable across the room mid-break. The extension does
not skip, hide, mute, or shorten ads — they play exactly as the service serves
them — so there is no fix; the room re-converges after the break. Two small guards keep a break
from doing worse than desync: an element whose duration ends far before the
room's position (an ad clip) never pauses the room when it ends, and an `ended`
is only broadcast if the element is still current a second later (players swap
the element right after an ad).

Ads stitched into the episode's own timeline, rather than played in a separate
element, would lengthen it for good at every break. The [episode start](/docs/watch-together/when-copies-differ) cannot help: it describes extras before the episode, not in it.

## Wire protocol

See `packages/shared/src/protocol.ts`. Six frames worth knowing beyond the obvious ones:
`join` carries `create: true` when the client is creating the room (the server
rejects collisions with `ROOM_EXISTS` and the client retries with a fresh code),
`playback` may carry `reason: 'stall'` so the popup can say who buffered, a `media`
frame carries a peer's self-reported mic/camera state (relayed to the others and
remembered for late joiners, so tiles can show who is muted), a `duration`
frame does the same for the length of a peer's copy of the room's episode,
`episodeStart` sets or clears where the episode starts in the longer copy (room
state, dropped if it names content the room has left, cleared by a content
change), and a `leader` frame announces a reassignment after the 60 s grace period a disconnected
leader is given (a rejoin with the same peer id within it keeps leadership; the
server evicts the stale socket).
Peer ids beginning with `obs:` are non-media observers (the harness) and are never
negotiated with.
