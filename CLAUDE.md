@AGENTS.md

## Claude-specific

- Each workspace has its own `AGENTS.md` (`apps/extension`, `apps/server`,
  `packages/shared`, `tools/harness`). Read the one for the code you are editing
  before your first edit there.
- Pinned agent skills live in `skills-lock.json` and are not committed. Restore
  them with `npx skills install`; the Chrome extension and modern-web guidance
  skills are the ones that matter for this repo.
- `pnpm test:e2e` and `pnpm test:sabotage` launch real Chrome windows and take
  minutes (the matrix ~3.5 min on a 14-core laptop). Run them in the background
  rather than blocking, and never report `pnpm verify` as passing without having
  seen it finish.
- Ask before running anything that hits the network beyond `pnpm install` — the
  project has no service to deploy to and releases happen from CI.
