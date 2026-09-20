---
sidebar_position: 4
title: How it stays in sync
---

# How it stays in sync

The server is the clock. Each client estimates its offset with five ping/pong
round trips, keeping the lowest-latency sample, and repeats that every minute
and whenever a peer connection comes up. The leader reports its position every
five seconds while playing.

Every 250 ms each client compares its own position to where the room should be:

| Drift | Action |
|---|---|
| under 250 ms | nothing |
| 250 to 1500 ms | a small playback-rate nudge, held until the drift is under 100 ms |
| 1500 ms or more | a hard seek |

The nudge scales with the drift, between 3% and 20%, so a large gap closes in
seconds while a small one is corrected without anyone noticing.

Commands the room applies on your player are tagged so their own echoes are not
rebroadcast, and a genuine action of a different kind inside that window still
propagates.

## Players the extension cannot touch directly

On most sites the extension holds the page's video element and reads its
position directly. Google Drive is not like that: it plays video inside an
embedded player the extension is not allowed to reach into, so it is driven
through that player's own messaging interface instead, which reports the
position about four times a second rather than continuously.

Between those reports the extension carries the position forward on its own
clock, which costs far less accuracy than the gap suggests. A room on Drive
still holds together comfortably inside the tolerances above, but it does sit
looser than one on a site whose player can be read directly.

Voice and video use a full mesh: every participant connects directly to every
other one. Only STUN is used to find a path; there is no relay, which keeps
media off any server but also means two participants behind very strict NATs
may not connect. See [troubleshooting](/docs/troubleshooting). A full mesh
also means each person's upload grows with the room; see
[how many people](/docs/watch-together#how-many-people).
