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

The recommended setup is a `wss://` address reachable from the internet, so
everyone can join from wherever they are. The quickest way to get one is a
[tunnel from your laptop](#quick-start-a-tunnel-from-your-laptop).

## Install

On the machine that will run the server:

```sh
git clone https://github.com/thatjoaoguy/gather-and-join.git
cd gather-and-join
pnpm install
```

Node 22.6 or newer and pnpm are required.

## Quick start: a tunnel from your laptop

Recommended for most groups. No account, no domain, no router changes. It needs
[`cloudflared`](https://github.com/cloudflare/cloudflared/releases)
(`brew install cloudflared` on macOS).

```sh
pnpm host
```

This starts the server and a Cloudflare quick tunnel, then prints the address:

```text
  Server URL for everyone's setup page:   wss://some-random-words.trycloudflare.com
```

Share that address. Keep the terminal open and the laptop awake for the whole
party; Ctrl-C stops both. The address changes every run, so everyone pastes the
new one each time. If that gets old, set up an always-on server.

## An always-on server

For a group that watches regularly and wants one address that never changes.
Use a machine that stays on (a home server, a Raspberry Pi, or a small cloud
instance) and a domain name that points at it.

1. Run the server and keep it running with whatever you normally use
   (systemd, pm2, a container):

   ```sh
   pnpm --filter @gj/server start      # listens on port 8080; PORT=9000 to change it
   ```

2. Put a reverse proxy in front of port 8080 that handles HTTPS and WebSocket
   upgrades. With [Caddy](https://caddyserver.com), which gets the certificate
   for you:

   ```sh
   caddy reverse-proxy --from party.example.com --to localhost:8080
   ```

3. If the machine is at home, forward ports 80 and 443 on your router to it.
4. Share `wss://party.example.com`.

Always use `wss://` for an address on the internet: the connection carries
display names and room codes, and only TLS keeps them private in transit.

## Share the address

Send the address to everyone in the group. Each of them pastes it once on the
extension's setup page. The host of the server and the leader of a room are
separate roles: whoever creates a room leads it, regardless of who runs the server.

The server only sets up the call. Voice and video go directly between
participants, so a remote server does not add any delay to the call.

## Everyone on the same network

Only for a group that is all on one network, such as a household watching in
different rooms, and that does not want a tunnel. The address does not work
for anyone outside that network.

1. Start the server with `pnpm --filter @gj/server start`.
2. Find the machine's local IP address: `ipconfig getifaddr en0` on macOS,
   `hostname -I` on Linux, `ipconfig` on Windows (the IPv4 address).
3. Share `ws://<that IP>:8080`, for example `ws://192.168.1.20:8080`.

Allow incoming connections for `node` if your firewall asks, and use the main
network rather than a guest one, which usually keeps devices from seeing each
other. Plain `ws://` is fine here because the traffic never leaves your network.

## Privacy notes for hosts

The server prints one line per room event (created, joined, left) to its
terminal, with display names. It writes nothing to disk. Set `GJ_LOG=0` to
silence the log. See the [privacy policy](/privacy) for the full picture.
