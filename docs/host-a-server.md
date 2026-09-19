---
sidebar_position: 2
title: Host a server
---

# Host a server

One person in the group runs the signaling server. It is a single file with no
database and no accounts, and it never sees any video or audio: it carries
display names, the room code, which episode the room is on, and play/pause
position. The room lives on that machine, so it has to stay on for the whole
party.

## Run it

```sh
git clone <repository url>
cd gather-and-join
pnpm install
pnpm --filter @gaj/server start      # listens on port 8080; PORT=9000 to change it
```

Node 22.6 or newer and pnpm are required.

## Make it reachable

Any machine every participant can reach works. Pick what fits:

- **Same network.** Everyone enters `ws://<that machine's LAN IP>:8080`.
- **A tunnel from your laptop.** `pnpm host` starts the server and a Cloudflare
  quick tunnel, and prints a `wss://…` address. The address changes each run and
  your laptop must stay awake.
- **An always-on machine or a small cloud instance** behind TLS. Put a reverse
  proxy that terminates HTTPS in front of port 8080 and share the `wss://` address.

Use `wss://` for anything beyond your own network: the connection carries display
names and room codes, and only TLS keeps them private in transit.

## Share the address

Send the address to everyone in the group. Each of them pastes it once on the
extension's setup page. The host of the server and the leader of a room are
separate roles: whoever creates a room leads it, regardless of who runs the server.

## Privacy notes for hosts

The server prints one line per room event (created, joined, left) to its
terminal, with display names. It writes nothing to disk. Set `GAJ_LOG=0` to
silence the log. See the [privacy policy](/privacy) for the full picture.
