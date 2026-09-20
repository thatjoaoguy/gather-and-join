---
sidebar_label: On Render (recommended)
title: Host a server on Render
---

# Host a server on Render

One person in the group runs the signaling server and shares its address.
Everyone else pastes that address into the extension's setup page once. The
server carries display names, the room code, which episode the room is on, and
the play/pause position — never any video or audio.

This page sets one up on **Render**, which runs it for free at an address that
never changes. It takes about five minutes and needs no credit card. You do not
need a copy of the source code.

There are two other ways, if this one does not suit you:

- [Host from your own machine](./host-on-your-machine.md) — a tunnel from your
  laptop for one evening.
- [Host on your local network](./host-on-your-network.md) — everyone on the same
  Wi-Fi, nothing exposed to the internet.

## 1. Create the service

Sign in at [dashboard.render.com](https://dashboard.render.com), then choose
**New → Web Service**. On the source step, pick the **Existing Image** tab and
paste this into **Image URL**:

```text
ghcr.io/thatjoaoguy/gather-and-join-server:latest
```

![The New Web Service page with the Existing Image tab selected and the image URL pasted in](/img/hosting/render-image-url.png)

Leave **Credential** as "No credential" — the image is public. Press
**Connect**.

## 2. Choose the free plan

Give the service a name. The name becomes its web address, so pick something
only your group would guess — `movie-night-8f21` rather than `gather-and-join`.
Anyone who finds the address can create rooms on your server.

Pick a **region** close to the people watching. The server is the room's clock,
so distance to it costs everyone a little accuracy.

Then scroll to **Compute** — and read this part carefully:

![The Compute section with the $0/month Free plan selected](/img/hosting/render-free-plan.png)

**Render pre-selects the $7/month plan.** Free is the first row but is not
chosen for you. Click it, and check the bar at the bottom of the page reads
**$0 / month** before you go on.

The warning Render shows about free instances sleeping is real, and harmless
here — see [what sleeping means](#what-sleeping-means) below.

## 3. Set the health check

Open the **Advanced** section and set **Health Check Path** to `/health`:

![The Advanced section with Health Check Path set to /health](/img/hosting/render-health-check.png)

The box suggests `/healthz` with a z. That is not this server's address and will
fail. Type `/health`.

Now press **Deploy web service**. The first deploy takes a minute or two.

## 4. Check it works

Render gives the service an address like `https://movie-night-8f21.onrender.com`.
Open it in a browser. A server that is running says so in plain words:

![The server's page in a browser, reading "Gather and Join signaling server 0.3.1, running."](/img/hosting/server-running.png)

Add `/health` to the address for the same answer with detail — the version, how
long it has been up, and how many rooms and people are on it right now:

```json
{"status":"ok","version":"0.3.1","uptimeSec":412,"rooms":1,"peers":3}
```

Those two are the only things served over the normal web. The extension itself
connects with `wss://`, which is why the address you share is not the `https://`
one.

## 5. Share the address

Take the address Render gave you, swap `https://` for `wss://`, and send that to
everyone:

```text
wss://movie-night-8f21.onrender.com
```

Each person pastes it once on the extension's setup page, and never again — it
does not change between parties. See [Install](./install.md) for their side.

## What sleeping means

A free service goes to sleep after 15 minutes with no traffic, and wakes up when
someone connects. In practice:

- **It cannot fall asleep during a party.** Every connected extension checks the
  clock once a minute, which counts as traffic.
- **The first person to arrive waits about 12 seconds** while it wakes. They see
  a Render holding page rather than the server, which is normal:

![Render's holding page, showing its own logo and a line reading "incoming HTTP request detected"](/img/hosting/render-waking-up.png)

- If you would rather nobody waits, open the `/health` address yourself a minute
  before the party starts.

Sleeping is also what keeps it free: a free workspace gets 750 hours of running
time a month, and the clock only ticks while the service is awake.

## Updating the server

Render does not pick up new versions on its own for this kind of service. When a
new release comes out, open the service in the dashboard and choose **Manual
Deploy → Deploy latest reference**. Check the version afterwards at `/health`.

## Other places it can run

Nothing here is specific to Render. The server is a small Node program with no
database and nothing stored on disk, published both as a container image and as
a single file, so it runs anywhere that can run **Docker** or **Node 22.6 or
newer** — a spare machine, a home server, another hosting provider.

Three things matter wherever you put it:

| Setting | Value |
| --- | --- |
| Port | `8080`, or set `PORT` to match what the host expects |
| Health check path | `/health` |
| Number of copies | exactly **one** |

The last one matters more than it looks. The server keeps rooms in its own
memory, so **two copies means two separate parties**: people who type the same
room code land on different ones and never see each other. Nothing reports this
— it simply looks as though your friends never arrived. Turn off anything that
adds copies automatically.

## Privacy notes for hosts

The server prints one line per room event (created, joined, left) to its log,
with display names — on Render, under the **Logs** tab. It writes nothing to
disk. Set a `GJ_LOG` environment variable to `0` to silence the log. See the
[privacy policy](/privacy) for the full picture.
