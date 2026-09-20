# tools/harness — agent guide

Everything needed to run the whole product without a streaming subscription:
a fake player page, self-identifying fake media, a headless observer that records
ground truth, a multi-peer launcher, the Playwright suite, and the sabotage
matrix. Root `AGENTS.md` first.

## Layout

```
player/index.html      the fake player — mirrors the DOM hazards real services have
src/player-server.ts   serves it (dev: :4173, tests: :14173)
src/peers.ts           launches one Chrome per peer with the test build loaded
src/party.ts           test-level composition: N peers in one room + the observer
src/observer.ts        an `obs:` client; its frame log is the ground truth
src/fixtures.ts        fake media; full fixtures via `make fixtures`, in-process fallback otherwise
src/sabotage-matrix.ts which tests MUST fail under each flag
tests/*.spec.ts        the Playwright suite
```

## How to write a test here

- **Assert a number, not a screenshot.** Pairwise position spread from the
  observer's frame log, hard-seek and re-attach counters, peak frequency bin per
  peer, sampled pixel colour, `framesDecoded`, `video.volume`. A test that cannot
  fail for a numeric reason does not belong.
- Compose with `startParty({ n })` and always `close()` in a `finally`.
- Use a fresh room code (the default): the server holds a room for its TTL after
  the last peer leaves, so a reused code collides with the previous run.
- Wait with `waitForCondition(..., { label })` — the label is what a timeout
  prints, and a timeout with no label is an hour of someone's life.
- Each peer has a distinct sine (440/554/659/784 Hz) and a distinct solid colour,
  which is how a test tells whose media it is looking at.

## The sabotage matrix

Each row disables one mechanism and asserts that **exactly** the tests guarding
it fail while everything else passes. A mechanism that cannot be made to fail is
not considered tested.

Adding or renaming a test that guards a mechanism means updating `MATRIX` in
`src/sabotage-matrix.ts` (titles are matched by substring) — and adding a
mechanism means adding a flag to `Sabotage` in
`apps/extension/lib/constants.ts`, honouring it in the code it disables, and
giving it a row.

```sh
pnpm test:e2e                                  # clean run
GJ_SABOTAGE=drift pnpm test:e2e                # one flag by hand
pnpm test:sabotage                             # the matrix
pnpm test:sabotage reattach                    # one row
GJ_SABOTAGE_PARALLEL=1 pnpm test:sabotage      # rows in sequence (small machine)
GJ_REUSE_SERVERS=1 TEST_SERVER_PORT=8080 TEST_PLAYER_PORT=4173 pnpm test:e2e
make fixtures                                  # full ffmpeg fixtures (optional)
```

`globalSetup` builds the test extension (`GJ_TEST=1 wxt build`) before the first
test, so the suite always runs your current code. `GJ_SKIP_BUILD=1` reuses
`.output-test` when you know it is fresh — it is the difference between a 20 s
and a 2 s start on a tight loop, and the wrong answer when it isn't. Each
sabotage row's full output is in `test-results/sabotage-logs/<flag>.log`.

## When a test is flaky

Do not add a retry or widen a tolerance to make a run green. Both hide the thing
the suite exists to catch. Find the race, or make the harness deterministic — the
reason the e2e suite is out of CI is exactly this, and widening the numbers would
make it useless locally too.
