# packages/shared — agent guide

The only code both sides import: wire protocol types, the room reducer, the
clock and drift policy, provider URL knowledge, ducking policy. Consumed as
TypeScript source (`main` points at `src/index.ts`) — there is no build. Root
`AGENTS.md` first.

## Hard constraints

- **No DOM, no `chrome.*`, no browser globals.** The server imports this package
  and runs it under plain Node. If a thing needs a `<video>` or a selector, it
  belongs in `apps/extension/lib/`.
- **No dependencies.** Not "few" — none. It is pure types and functions.
- **Relative imports carry the `.ts` extension** (`./room.ts`): consumers run it
  under `node --experimental-strip-types`.
- **Changing a frame changes both sides at once.** A protocol edit that lands
  without the server and the extension following is a broken room, and there is
  no version negotiation to save you.
- Keep the policy numbers here, not duplicated at the call sites: the drift bands
  (250 ms dead zone, nudge to 1500 ms, hard seek beyond) and the nudge formula
  (`|drift|/4000`, clamped 3–20 %) are the reason the sync tests pass.

## Files

| File | Owns |
|---|---|
| `protocol.ts` | every wire frame |
| `room.ts` | the room reducer and room-code rules (Crockford base32, no I/L/O/U) |
| `sync.ts` | clock offset, drift bands, the nudge |
| `providers.ts` | hosts, match patterns, content-id parsing, watch URLs |
| `content.ts` | content identity (`urn:…` ids) |
| `ducking.ts` | ducking levels and timings — shared so harness tests budget against the mechanism instead of hardcoding numbers |

## Verifying

```sh
pnpm --filter @gj/shared test:unit
pnpm --filter @gj/shared typecheck
```

A policy change here is not proven by its unit test alone — run `pnpm test:e2e`
and the relevant `pnpm test:sabotage` row, which is where the numbers are
actually asserted against real Chromes.
