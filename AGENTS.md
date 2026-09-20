# Agent guide

Gather & Join keeps a small group on the same second of the same episode and
puts a call alongside it: a Chrome MV3 extension (WXT + TypeScript) plus a
signaling server one participant hosts. pnpm workspace, no UI framework, no
bundler for the server.

Read this file, then the `AGENTS.md` in the workspace you are about to change.
`README.md` is the product and the protocol in detail; `CONTRIBUTING.md` is the
human process. This file does not repeat them — it routes you to the right code
and tells you what a change has to survive.

## Where work goes

| The change | Touch | Prove it with |
|---|---|---|
| Sync, drift, echo suppression | `packages/shared/src/sync.ts`, `apps/extension/lib/sync-engine.ts` | a harness test that asserts a number, plus the matching sabotage row |
| Wire protocol / room rules | `packages/shared/src/protocol.ts`, `room.ts`, `apps/server/src/index.ts` | `packages/shared/test`, `apps/server/test` |
| A new streaming service | `packages/shared/src/providers.ts` **and** `apps/extension/lib/providers/` | `packages/shared/test/providers.test.ts`; extend the fake player if the site has a new DOM hazard |
| Call / WebRTC | `apps/extension/lib/mesh.ts`, `perfect-peer.ts`, `loopback-sender.ts` | `apps/extension/test` with the fakes, then `tools/harness/tests/media.spec.ts` |
| Room lifecycle, rejoin, persistence | `apps/extension/lib/room-session.ts`, `room-client.ts` | `apps/extension/test/room-session.test.ts`, `reconnect.spec.ts` |
| Popup / options / sidebar UI | `apps/extension/entrypoints/*`, `lib/sidebar/`, `lib/ui/` | tokens from `docs/design-system`; screens are `docs/design-system/screens/index.html` |
| What the server prints | `apps/server/src/index.ts` | `apps/server/test/server.test.ts`; keep the `key=value` line shape |

Don't guess which layer owns a behaviour. The README's "Architecture (why five
pieces)" and "Modules" tables say who owns what, and the ownership is load-bearing:
each context has a different lifetime.

## Commands

```sh
pnpm install
pnpm exec playwright install --with-deps chromium   # once, from tools/harness

pnpm verify           # lint → typecheck → unit → build → e2e → sabotage matrix
pnpm lint             # eslint, flat config at the root
pnpm typecheck        # every workspace, tsc --noEmit
pnpm test:unit        # vitest: shared, extension libs, server
pnpm test:e2e         # Playwright: N real Chromes, fake player, fake media
pnpm test:sabotage    # every row; `pnpm test:sabotage drift` for one
```

`pnpm verify` is the gate before a pull request and it runs everything headless
without a subscription. CI runs only lint, typecheck, unit and build — the e2e
suite and the sabotage matrix are deliberately not in CI (flaky peer connection
on runners), so **running them locally is your job, not the reviewer's**.

## Invariants

Product decisions. A change that breaks one is wrong even if it passes:

- Mic on by default, camera opt-in, ducking off by default.
- Manual resume after a buffering pause. Never auto-resume.
- Anyone plays or pauses; only the leader changes episodes.
- No media through the server. No analytics, telemetry, or remote code.
- Never touch ads, DRM, credentials, or the service's own telemetry.
- The server keeps room state in memory only and writes nothing to disk.

Technical ones, each of which has already cost someone a day:

- **The content script dies on every navigation.** Nothing long-lived may live
  there. The `RoomSession`, the socket and every `RTCPeerConnection` live in the
  offscreen document, which is the whole reason the call survives an episode change.
- **The offscreen document has no `chrome.storage`**, only `chrome.runtime`. It
  reads and writes storage through the service worker via `lib/kv.ts`.
- **Media cannot cross extension contexts.** Remote video reaches the page tiles
  over a local loopback `RTCPeerConnection`, not by passing a `MediaStream`.
- **`packages/shared` must stay DOM-free** — the server imports it. DOM knowledge
  about a provider belongs in `apps/extension/lib/providers/`.
- **The test hook and the sabotage flags are gated on `GJ_TEST=1`** at build time
  and must never reach a production build; a production manifest must not carry
  localhost host permissions.
- **Fonts and brand marks are copied from `docs/design-system` at build time.**
  Do not add a second copy under `apps/extension/public/`.
- **Versions and `CHANGELOG.md` are written by semantic-release.** Never edit a
  `version` field or the changelog by hand.

## Conventions

- Entry points are wiring only. Behaviour lives in `lib/` as classes with
  injected collaborators, so every one of them runs under vitest with the fakes
  in `apps/extension/test/fakes.ts`. Write new behaviour that way or it is untestable.
- TypeScript strict, `noUncheckedIndexedAccess` on, ESM everywhere, `.ts`
  extensions in relative imports inside `packages/shared` and `tools/harness`
  (they run under `node --experimental-strip-types`).
- `import type` for types — `consistent-type-imports` is an error, not a warning.
- Comments explain *why*, especially when the code looks wrong: most of the odd
  shapes here are a real browser or provider quirk. Match the density of the file
  you are in; don't narrate the obvious.
- No new dependency without a reason that survives "could this be twenty lines?".

## Finishing a change

1. `pnpm verify`, and say plainly if a row failed.
2. Sync behaviour changed → a harness test asserting a number, and check whether
   a sabotage row now needs to expect it (`tools/harness/src/sabotage-matrix.ts`).
3. One change per commit, Conventional Commits subject (`feat:`, `fix:`,
   `chore:`…) — it decides the release and becomes the changelog entry.
4. A new host permission disables the extension for existing users until they
   accept it: say so in the commit subject.
5. Store listing, permissions or data handling changed → update
   `CHROMEWEBSTORE.md` and the privacy page on the `docs` branch.
