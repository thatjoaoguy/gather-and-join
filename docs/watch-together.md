---
sidebar_position: 3
title: Watch together
---

# Watch together

## Create or join

One person opens an episode, clicks the extension, and presses **Create a
room**. The popup shows a six-character code. Everyone else clicks the
extension, types the code, and presses **Join room**. If they are on a different
episode, the popup offers one button that takes them to the right one.

## During the show

- **Anyone can play, pause, or seek.** Everyone follows.
- **Only the room leader changes episodes.** The leader is whoever created the
  room; if they leave, the person who has been in the room longest takes over.
- **If someone buffers, the room pauses** and the popup says who. Resume is a
  manual press by anyone, on purpose: automatic resume thrashes.
- **The participant rail** sits beside the player, also in fullscreen. Cameras
  that are on show live video; otherwise you see initials.
- **Mic** is on when you join. **Camera** is off until you turn it on.
- **Voice ducking** lowers the show while you speak. It is off by default and
  lives on the setup page; with speakers, the show itself keeps triggering it.

## How many people?

There is no fixed limit. The call is the constraint: everyone sends their
voice, and their camera if it is on, directly to every other person, so each
person's upload grows with the size of the room.

| People | Upload per person, voice only | Upload per person, all cameras on |
|---|---|---|
| 2 | 0.03 Mbps | 0.6 Mbps |
| 4 | 0.1 Mbps | 1.9 Mbps |
| 6 | 0.16 Mbps | 3.2 Mbps |
| 8 | 0.22 Mbps | 4.4 Mbps |
| 10 | 0.29 Mbps | 5.5 Mbps |

Download is about the same. Each camera that is on costs every other person
roughly 0.6 Mbps each way.

- **Up to 6 with cameras on** works comfortably on most home connections.
- **Bigger groups:** keep cameras off. Voice alone stays small even at 10.
- **Uploads are the limit.** Many home plans upload far less than they
  download, so check yours before a big camera-on night. Older laptops also
  feel it sooner: every stream is encoded separately for each person.

These figures come from a test of up to 10 people with every camera on and
no network limits, so they show what the call asks for, not what a slow
connection can deliver.

## Leaving

Press **Leave room**. Your microphone and camera are released immediately.
Closing the tab does the same.

## Ad-supported plans

Ad breaks land at different points for each viewer, and the extension does not
skip, hide, mute, or shorten them. The room drifts during a break and
re-converges after it. That is expected.
