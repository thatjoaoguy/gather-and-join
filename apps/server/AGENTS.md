# apps/server — agent guide

Node + `ws` signaling and sync server. One file, `src/index.ts`. No database, no
auth, no framework, and it stays that way. Runs under
`node --experimental-strip-types` (Node ≥ 22.6) — there is no build step. Root
`AGENTS.md` first.

## What it is responsible for

- The room registry and the authoritative sync state (it is the clock: clients
  estimate their offset from its ping/pong).
- Relaying signaling frames between peers. It never sees media.
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
- `PORT` overrides 8080. That is the only knob.

## Verifying

```sh
pnpm --filter @gj/server test:unit    # integration tests over a real ws server
pnpm --filter @gj/server typecheck
pnpm dev:server                       # ws://localhost:8080, --watch
```

Room-lifecycle changes (joins, eviction, leader handover, TTL) need a case in
`test/server.test.ts`; the ones about what clients then do need a harness test.
