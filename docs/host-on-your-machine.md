---
sidebar_label: From your own machine
title: Host from your own machine
---

# Host from your own machine

This runs the server on your own computer and puts a temporary public address in
front of it, so people outside your network can join. It suits a one-off evening.

For anything regular, [hosting on Render](./host-a-server.md) is less work: the
address never changes, nobody has to keep a laptop open, and it is also free.

Two things to know before you start. The address is different every time, so
everyone re-enters it for each party. And the room lives on your machine, so it
ends if your laptop sleeps, loses Wi-Fi, or you close the terminal.

## What you need

- **Node 22.6 or newer**, or Docker. Nothing else is installed.
- **[cloudflared](https://github.com/cloudflare/cloudflared/releases)**, which
  makes the temporary address. On macOS: `brew install cloudflared`.

## 1. Start the server

Download `gather-and-join-server-<version>.mjs` from the
[latest release](https://github.com/thatjoaoguy/gather-and-join/releases/latest)
and run it:

```sh
node gather-and-join-server-0.3.1.mjs
```

Or, if you would rather use Docker:

```sh
docker run -d --name gather-and-join -p 8080:8080 \
  ghcr.io/thatjoaoguy/gather-and-join-server:latest
```

Either way it listens on port 8080. Check it by opening `http://localhost:8080/`
— a running server answers in plain words.

## 2. Open the tunnel

In a second terminal:

```sh
cloudflared tunnel --protocol http2 --url http://localhost:8080
```

It prints an address like `https://some-random-words.trycloudflare.com`.

## 3. Share the address

Swap `https://` for `wss://` and send that to everyone:

```text
wss://some-random-words.trycloudflare.com
```

Each person pastes it on the extension's setup page. They will have to do it
again next time — this address is new on every run.

## While the party runs

Keep both the server and the tunnel running, and keep the machine awake — on a
Mac, `caffeinate -d` in another terminal will do it. Everything stops when you
press `Ctrl-C`.

If the tunnel drops and you restart it, the address changes and everyone has to
paste the new one.

## If you already have the source code

You do not need it — the steps above are the whole job. But if you have the
repository checked out anyway, one command replaces both of them:

```sh
pnpm host
```

It starts the server, opens the tunnel, and prints the finished address:

```text
  Server URL for everyone's setup page:   wss://some-random-words.trycloudflare.com
```

`Ctrl-C` stops both halves together.

## Why the tunnel at all

The address has to start with `wss://`, which means it needs a certificate.
Cloudflare provides one for the temporary address it hands you. Without a
tunnel, other people cannot reach your machine at all unless you open ports on
your router — and even then the connection would not be encrypted.

If everyone is on the same Wi-Fi as you, none of this applies: see
[hosting on your local network](./host-on-your-network.md) instead.
