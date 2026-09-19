---
sidebar_position: 5
title: Troubleshooting
---

# Troubleshooting

## "Can't reach the server"

- Ask the host whether the server is still running and, for a laptop tunnel,
  whether the address changed. A tunnel address is new every run.
- The address should start with `wss://`. A `ws://` address with a local IP
  only works for people on the host's own network; anyone else needs a
  [tunnel or always-on server](/docs/host-a-server#quick-start-a-tunnel-from-your-laptop).
- For a same-network setup, check that the host allowed `node` through their
  firewall and that nobody is on a guest network.

## Nobody can hear me

- Open the setup page and check that the microphone shows as allowed. Chrome's
  own site settings for the extension and the system privacy settings can each
  block it.
- Use headphones. With speakers, echo cancellation removes your voice along with
  the show.

## One person's voice never connects

Two participants behind very strict NATs may not find a direct path, because
the extension does not use a relay server. A VPN or overlay network between the
two of them usually fixes it. Everyone else in the room is unaffected.

## The room keeps pausing

Someone is buffering. The popup names who. Their connection to the streaming
service is the issue, not the room.

## We drift during ads

Expected on ad-supported plans. The room re-converges after the break.

## Reporting a bug

Open the setup page, expand **Diagnostics**, and press **Copy diagnostics**.
Paste that into a bug report. It contains display names and the server host,
but no media and nothing from the streaming service.
