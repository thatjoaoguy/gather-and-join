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
  different kind inside that window still propagates). A frame reaches the page
  twice, as itself and in the snapshot that follows it; a room state identical to
  the one just applied is skipped, or a facade would be sent a second play or pause.

## Buffering

- A player whose buffer runs dry (`waiting`, and still short of data 750 ms later)
  pauses the room **at its own position**. Not the room's last anchor: that is up to
  a heartbeat (5 s) old, and pausing there rewinds everyone, the stalled player
  included, out of the buffer it was waiting on.
- For a second after that pause comes back from the server (10 s at most while
  waiting for it), the stalled player's own `play` and `seeking` events are held
  back, and a play is put back to the room's pause. Players pick themselves up the
  moment data returns, and passed on, that resumes the room for everyone: HBO Max
  was seen doing it 33 ms after its stall reached the others. Someone else resuming
  ends the hold at once. Resume stays manual.
- While the room is paused on its stall, that player reports itself ready once it
  has 5 s loaded past where it stopped (`READY_AHEAD_MS`). It goes by `buffered`,
  never `readyState`, which HBO Max reported as 4 with 1 s loaded and 2 with 12 s.
  The Disney+ facade moves its element's ranges onto the program clock, and the
  Drive facade reads the embed's `videoLoadedFraction`; a player that cannot say
  stays on Buffering. Ready changes the pill and the popup; it resumes nothing.

## Ad breaks

On ad-supported tiers, ad breaks land at different points per viewer, so
`currentTime` is not comparable across the room mid-break. The extension does
not skip, hide, mute, or shorten ads — they play exactly as the service serves
them — so there is no fix; the room re-converges after the break. Three small guards keep a break
from doing worse than desync: an element whose duration ends far before the
room's position (an ad clip) never pauses the room when it ends; an `ended`
is only broadcast if the element is still current a second later (players swap
the element right after an ad); and once a copy's length is known, an element
much shorter than it is taken as an ad, however long it runs, so a break never
changes the length the room tells copies apart by (ads can be longer than the
60 s that rules out short clips).

Ads stitched into the episode's own timeline, rather than played in a separate
element, would lengthen it for good at every break. The [episode start](/docs/watch-together/when-copies-differ) cannot help: it describes extras before the episode, not in it.

## Wire protocol

See `packages/shared/src/protocol.ts`. Eight frames worth knowing beyond the obvious ones:
`welcome` is the server's first frame on every socket and carries its version (the
extension compares it with its own, since both are released under one number, and
tells the user which side to update; nothing is negotiated),
`join` carries `create: true` when the client is creating the room (the server
rejects collisions with `ROOM_EXISTS` and the client retries with a fresh code),
`playback` may carry `reason: 'stall'`, at the stalled player's own position, so the
sidebar and the popup can say who buffered, a `bufferReady` frame then says that
player has caught up (relayed to the others and never remembered: a late joiner
never saw the stall), a `media`
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
