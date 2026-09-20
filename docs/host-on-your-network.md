---
sidebar_position: 4
title: Host on your local network
---

# Host on your local network

If everyone watching is on the same Wi-Fi — a household in different rooms —
the server can stay on your network entirely. Nothing is exposed to the
internet, and there is no tunnel and no account anywhere.

The address only works for people on that network. Anyone joining from
elsewhere needs [Render](./host-a-server.md) or
[a tunnel](./host-on-your-machine.md).

## 1. Start the server

With Node 22.6 or newer, using
`gather-and-join-server-<version>.mjs` from the
[latest release](https://github.com/thatjoaoguy/gather-and-join/releases/latest):

```sh
node gather-and-join-server-0.3.1.mjs
```

Or with Docker:

```sh
docker run -d --name gather-and-join -p 8080:8080 \
  ghcr.io/thatjoaoguy/gather-and-join-server:latest
```

It listens on port 8080. `PORT=9000` moves it if something else is there.

## 2. Find your machine's address on the network

| System | Command |
| --- | --- |
| macOS | `ipconfig getifaddr en0` |
| Linux | `hostname -I` |
| Windows | `ipconfig` — use the IPv4 address |

You want something like `192.168.1.20`. An address starting `127.` is the
machine talking to itself and will not work for anyone else.

## 3. Check it from another device

On a second device on the same Wi-Fi, open `http://192.168.1.20:8080/` in a
browser, substituting your own address. A running server answers in plain
words. If nothing loads, see [when it does not work](#when-it-does-not-work).

## 4. Share the address

Send everyone the same address with `ws://` in front:

```text
ws://192.168.1.20:8080
```

Plain `ws://` rather than `wss://` is fine here, because the traffic never
leaves your network. Chrome allows it for extension pages.

Your machine's address can change when it reconnects to the router. If the room
stops working between parties, check the address again — or reserve a fixed one
for that machine in your router's settings.

## When it does not work

- **Your firewall.** The first time you start the server, macOS and Windows
  usually ask whether to allow incoming connections. If you dismissed that,
  allow it in the firewall settings.
- **A guest network.** Guest Wi-Fi normally stops devices seeing each other.
  Everyone has to be on the main network.
- **Wired and wireless on different subnets.** Some routers separate them; put
  everyone on the same one.
