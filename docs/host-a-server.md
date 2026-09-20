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

You do not need a copy of the source code. Pick one of the two ways below to
run the server, then pick how people reach it.

## Run it

### With Docker

Nothing to install but Docker itself:

```sh
docker run -d --name gather-and-join --restart unless-stopped \
  -p 8080:8080 ghcr.io/thatjoaoguy/gather-and-join-server:latest
```

It restarts by itself if the machine reboots. `docker stop gather-and-join`
ends it.

### With Node

Download `gather-and-join-server-<version>.mjs` from the
[latest release](https://github.com/thatjoaoguy/gather-and-join/releases/latest)
and run it. Node 22.6 or newer, and nothing to install:

```sh
node gather-and-join-server-0.3.0.mjs
```

It listens on port 8080. `PORT=9000 node gather-and-join-server-0.3.0.mjs` moves
it somewhere else.

## Check it is running

Open `http://localhost:8080/` in a browser. A server that is up answers in
plain words:

```text
Gather & Join signaling server 0.3.0 — running.
```

`http://localhost:8080/health` gives the same answer for a script, plus how long
it has been up and how many rooms and people are on it right now:

```json
{"status":"ok","version":"0.3.0","uptimeSec":412,"rooms":1,"peers":3}
```

Those two addresses are the only things the server serves over plain web. The
extension itself connects with `ws://` or `wss://`, which is why pasting the
`http://` address into the setup page will not work.

## Quick start: a tunnel from your laptop

Recommended for most groups. No account, no domain, no router changes. It needs
[`cloudflared`](https://github.com/cloudflare/cloudflared/releases)
(`brew install cloudflared` on macOS).

Start the server as above, then point a tunnel at it:

```sh
cloudflared tunnel --protocol http2 --url http://localhost:8080
```

It prints an address like `https://some-random-words.trycloudflare.com`. Swap
the `https://` for `wss://` and share that:

```text
wss://some-random-words.trycloudflare.com
```

Keep both running and the laptop awake for the whole party; Ctrl-C stops the
tunnel. The address changes every run, so everyone pastes the new one each time.
If that gets old, set up an always-on server.

If you have the source code checked out, `pnpm host` does both steps at once and
prints the finished `wss://` address for you.

## An always-on server

For a group that watches regularly and wants one address that never changes.
Everyone pastes it once and never thinks about it again, and nobody has to keep
a laptop open.

### On a machine you keep on

A home server, a Raspberry Pi, or a small cloud instance, with a domain name
pointing at it.

1. Run the server with Docker as above, so it comes back after a reboot.
2. Put a reverse proxy in front of port 8080 that handles HTTPS and WebSocket
   upgrades. With [Caddy](https://caddyserver.com), which gets the certificate
   for you:

   ```sh
   caddy reverse-proxy --from party.example.com --to localhost:8080
   ```

3. If the machine is at home, forward ports 80 and 443 on your router to it.
4. Share `wss://party.example.com`.

### On a hosting service

Services that run a container — [Render](https://render.com),
[Railway](https://railway.com) and others — give you an `https://` address with
a certificate already set up, so there is no reverse proxy and no router to
configure. Point them at the image:

```text
ghcr.io/thatjoaoguy/gather-and-join-server:latest
```

Then check three settings, whatever the service calls them:

| Setting | Value |
| --- | --- |
| Port | `8080` |
| Health check path | `/health` |
| Number of instances | exactly **1**, and never sleeping |

The last one matters more than it looks. The server keeps rooms in its own
memory, so **two instances means two separate parties**: people who type the
same room code land on different copies and never see each other. Services that
add instances under load, or that put an app to sleep when it is idle, will
break a party in the middle. Turn both off — free plans that sleep after a few
minutes are not suitable.

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

1. Start the server as above.
2. Find the machine's local IP address: `ipconfig getifaddr en0` on macOS,
   `hostname -I` on Linux, `ipconfig` on Windows (the IPv4 address).
3. Share `ws://<that IP>:8080`, for example `ws://192.168.1.20:8080`.

Allow incoming connections if your firewall asks, and use the main network
rather than a guest one, which usually keeps devices from seeing each other.
Plain `ws://` is fine here because the traffic never leaves your network.

## Privacy notes for hosts

The server prints one line per room event (created, joined, left) to its
terminal, with display names. With Docker, `docker logs gather-and-join` shows
them. It writes nothing to disk. Set `GJ_LOG=0` to silence the log. See the
[privacy policy](/privacy) for the full picture.
