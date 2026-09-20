# Contributing

Thanks for helping. Gather & Join is a small household tool, so the bar is
"keeps working for five people on a Friday night", not "handles a million
users". Small, verified changes are welcome; sweeping rewrites are not.

Working with a coding agent? `AGENTS.md` at the root is written for one, with a
per-workspace `AGENTS.md` under `apps/extension`, `apps/server`,
`packages/shared` and `tools/harness`. Keep them true when you change how
something works.

## Setting up

Requirements: Node ≥ 22.6 (CI uses 26), pnpm 12, and Chromium for the
end-to-end suite.

```sh
pnpm install
pnpm exec playwright install --with-deps chromium   # from tools/harness, once
pnpm dev:server                                       # ws://localhost:8080
pnpm dev:harness                                      # fake player at http://localhost:4173
pnpm --filter @gj/extension build                    # → apps/extension/.output/chrome-mv3
```

Load `apps/extension/.output/chrome-mv3` unpacked in Chrome (`chrome://extensions`
→ Developer mode → Load unpacked). The README's "Quick start" has the rest.

## Before you open a pull request

```sh
pnpm verify
```

That runs lint, typecheck, unit tests, the build, the end-to-end suite against
the fake player, and the sabotage matrix (each row disables one mechanism and
checks that exactly its guarding test fails). Everything runs headless without
an HBO Max subscription. If a change touches sync behaviour, add or adjust a
test in `tools/harness/tests`; the suite asserts numbers (drift, seeks,
re-attaches), not screenshots.

CI runs lint, typecheck, unit tests and the build on every pull request to
`main` and on every push to `main`, where a failure stops the release. The
end-to-end suite and the sabotage matrix are **not** in CI yet: peers
intermittently fail to connect on a runner, which made most runs red for
reasons unrelated to the change under test. Run them locally before opening a
pull request.

Things a change must preserve, because they are product decisions:

- Mic on by default, camera opt-in, ducking off by default.
- Manual resume after a buffering pause. No auto-resume.
- Anyone can play or pause; only the leader changes episodes.
- No media through the server, no analytics, no telemetry, no remote code.
- The extension never touches ads, DRM, credentials, or the service's own
  telemetry. See the Legal section of the README.

## Adding a streaming service

Providers live in `packages/shared/src/providers.ts` (hosts, match patterns,
content id parsing) and adapters in `apps/extension/lib/providers/` (how to find
the `<video>`, the autoplay panel, and so on). The harness's fake player mirrors
the DOM hazards a real service has; extend it when a new service introduces a
new one, so the behaviour stays testable without a subscription.

Adding a service adds a host permission. Chrome disables the extension for
existing users until they accept it, so say so in the commit subject; it lands
in the release notes.

## Design

The visual spec is `docs/design-system/` and it is the source of truth for
tokens, fonts, and brand assets. The extension copies fonts and marks from
there at build time; do not add second copies under `apps/extension/public/`.

## Commit messages

One change per commit, imperative subject line, a body that says why. Reference
issues where they exist.

Subjects follow [Conventional Commits](https://www.conventionalcommits.org/)
(Angular preset), because they drive releases. Every push to `main` that passes
CI runs [semantic-release](https://semantic-release.gitbook.io/), which reads the
commits since the last tag and:

| Commit | Release |
| --- | --- |
| `fix: ...` | patch (`0.1.0` → `0.1.1`) |
| `feat: ...` | minor (`0.1.0` → `0.2.0`) |
| `BREAKING CHANGE:` in the body | major |
| `docs:`, `chore:`, `ci:`, `test:`, `refactor:`, ... | none |

A release sets the version in every `package.json`, prepends the notes to
`CHANGELOG.md`, tags `vX.Y.Z`, and publishes a GitHub release with the Chrome
Web Store ZIP attached. Don't edit versions or the changelog by hand. When a
pull request is squash-merged, its title becomes the commit subject, so give the
title the same form.

## Reporting bugs

Use the bug report template. The setup page has a **Copy diagnostics** button
that assembles room state, peer states, and the recent event log into one
paste; include it. It contains display names and the server host but no media
and nothing from the streaming service.
