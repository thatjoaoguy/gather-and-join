---
sidebar_position: 5
title: Watch together
---

# Watch together

## Create or join

One person opens an episode or a video, clicks the extension, and presses
**Create a room**. The popup shows a six-character code. Everyone else clicks the
extension, types the code, and presses **Join room**. If they are on a different
episode, the popup offers one button that takes them to the right one.

The first time you use the extension on a service, the popup asks you to
**Allow** it there. The extension has access to no site until you do, and it
asks for that one service only. The setup page lists every service with a
switch, so you can see what you allowed and take it back.

Before you join, the popup shows whether your microphone, camera and server
are ready. The eye next to the server address hides it, for when you are
sharing your screen.

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
- **The gear** at the top of the participant rail opens the room's settings
  without leaving the player: the room code, your mic and camera, the service
  and episode (with a link there if you are somewhere else), how much a longer
  copy skips, and the server.
- **The toolbar icon** carries a dot while you are in a room: green once you
  are connected, amber while a join or a reconnect is in progress. No dot means
  you are not in a room.

## When copies differ

In some regions a service puts extras in front of an episode, such as a promo
or a "stay tuned" card, so the same episode runs longer for some people than
for others. When the copies in the room differ, the participant rail says by
how much and suggests that as how much the longer copy skips. Anyone can press
**Align**, and change it later from the gear, typed as minutes and seconds to
the hundredth.

The longer copy then skips its extras and nobody watches them. The next episode
starts with no skip, since it may have no extras at all.

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

## YouTube

- **Each viewer's ads are their own.** While an ad plays for someone, they
  neither drive the room nor get corrected by it, and they rejoin the room's
  position when the ad ends. Ads are never skipped, hidden or counted:
  different people simply get different ones, and the room waits for nobody.
- **Short links work.** A `youtu.be` or `/live/` link counts as the same video
  as its `/watch?v=` form.
- **Shorts are not supported.** The Shorts feed scrolls on to the next video by
  itself, which would take a viewer away from what the room is watching.
- **The related videos on the right are slightly cut off** while the
  participant rail is open. YouTube sizes that column from the whole window, and
  an extension cannot change that without breaking on YouTube's next update, so
  it is left alone.

## Google Drive

Drive works a little differently from a subscription service, because there is
no subscription: there is one file, and everyone opens it from their own Google
account.

- **Share the file with everyone first.** View access is enough. Someone the
  file was never shared with cannot open it, and the room cannot help them.
- **Drive limits how many people can stream one file at once.** If someone sees
  *"Sorry, you can't view or download this file at this time"*, that is Drive's
  own quota, not the extension and not your connection. It clears by itself,
  but there is no way to hurry it — worth knowing before a big night rather
  than during one.
- **If someone lands on "Unable to load video"**, they are probably signed in
  to more than one Google account, and Chrome opened the link under the wrong
  one. A Drive link with no account in it always opens under the *first*
  account. Opening the file's own URL directly fixes it. The **Go to episode**
  button in the popup has the same limitation, for the same reason: the account
  order is different on every computer, so there is no single link the room can
  hand out that is right for everyone in it.
- **Nothing plays next.** Drive plays one file and stops, so a room on Drive
  never wanders off on its own the way an autoplaying episode can.

## Wix Video

Wix sites show video in a player that Wix serves from its own address and
embeds in the site's page. The extension works inside that player and never
touches the rest of the site.

- **The participant rail sits inside the video player**, beside the video,
  rather than beside the whole page. The site around it is left as it is.
- **Go to episode opens the video player on its own**, full-window, rather than
  the site's page it came from.
- **Everyone needs access to the video on the site**, just as they would to
  watch it alone.
- **Nothing plays next.** At the end the player goes back to its cover and stays
  on the same video.

## Leaving

Press **Leave room**. Your microphone and camera are released immediately.
Closing the tab does the same.

## Ad-supported plans

Ad breaks land at different points for each viewer, and the extension does not
skip, hide, mute, or shorten them. The room drifts during a break and
re-converges after it. That is expected.
