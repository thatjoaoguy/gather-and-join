# apps/server — agent guide

Node + `ws` signaling and sync server. No database, no auth, no framework, and it
stays that way. `src/index.ts` is the whole server and is a library; `src/main.ts`
is the entrypoint that starts it and handles signals. Runs under
`node --experimental-strip-types` (Node ≥ 22.6) from source. Root `AGENTS.md`
first.

It also ships as two packaged artifacts that hosts use instead of this repo — a
bundled `gj-server.mjs` and a container image. See "Packaging" below.

## What it is responsible for

- The room registry and the authoritative sync state (it is the clock: clients
  estimate their offset from its ping/pong).
- Relaying signaling frames between peers. It never sees media.
- Two plain GETs on the same port: `/` so a host checking their address in a
  browser gets an answer rather than `ws`'s `426`, and `/health` for the uptime
  check every hosting platform wants. Nothing else is served, ever.
- Leadership: the creator leads; a disconnected leader keeps it for a 60 s grace
  period, then a `leader` frame announces the reassignment.
- One `key=value` line per room event on stdout. Nothing for playback or
  signaling frames — stalls are the exception. `GJ_LOG=0` silences it.

## Rules

- **In memory only.** No disk, no persistence, no `process.env` secrets. A host
  restarting the server loses the room, and that is the documented behaviour.
- **Nothing beyond the documented fields.** The server sees display names, room
  codes, a content id and a playback position. Adding a field to the wire is a
  privacy claim change: the README's Legal section and the privacy page on the
  `docs` branch have to follow.
- **Frame shapes live in `packages/shared/src/protocol.ts`**, not here. Validate
  what arrives; never widen a type locally to make a message fit.
- **Keep the log line shape.** `<iso> <event> key=value …`, one line, no
  multi-line dumps — people paste these into bug reports. New event → add it to
  the event list in the README.
- **Peer ids starting with `obs:`** are non-media observers (the harness) and are
  never negotiated with. Don't special-case them anywhere else.
- **Rooms live in one process's memory,** so the server never scales past a
  single instance. A second one silently splits a party across two machines
  sharing a room code. Anything suggesting otherwise (sticky sessions, a shared
  store) is a design change, not a tweak.
- `PORT` overrides 8080; `ROOM_TTL_MS`, `LEADER_GRACE_MS`, `HEARTBEAT_MS`,
  `WATCH_URL_TEMPLATE`, `GJ_LOG` and `GJ_VERSION` are the rest. Adding a knob
  means adding it to the header comment in `src/index.ts` and to the README.

## Packaging

`scripts/bundle.mjs` (esbuild) produces one dependency-free `dist/gj-server.mjs`
with `ws` and `@gj/shared` inlined and the version baked in. `Dockerfile` copies
that bundle onto a Node base. Both are built by `.github/workflows/packaging.yml`
on release; `checks.yml` builds and smoke tests the image on every PR.

- **Keep the bundle unminified.** It is the artifact strangers are asked to
  download and run, so it has to stay readable.
- **Keep `/health` cheap and truthful.** It is what the container healthcheck and
  every hosting platform poll.
- Changing the entrypoint means changing `Dockerfile`, `scripts/host.sh` and
  `tools/harness/playwright.config.ts` with it.

## Verifying

```sh
pnpm --filter @gj/server test:unit    # integration tests over a real ws server
pnpm --filter @gj/server typecheck
pnpm --filter @gj/server build        # → dist/gj-server.mjs
pnpm dev:server                       # ws://localhost:8080, --watch
```

The packaged paths are worth exercising when either changes:

```sh
node apps/server/dist/gj-server.mjs && curl localhost:8080/health
docker build -f apps/server/Dockerfile -t gj-server .
```

Room-lifecycle changes (joins, eviction, leader handover, TTL) need a case in
`test/server.test.ts`; the ones about what clients then do need a harness test.
