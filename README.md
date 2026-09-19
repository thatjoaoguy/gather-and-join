# Gather & Join — website

The project site and privacy policy, built with [Docusaurus](https://docusaurus.io)
and deployed to GitHub Pages by `.github/workflows/deploy-docs.yml` on every
push to this `docs` branch. The extension and server live on `main`.

```sh
pnpm install
pnpm start        # http://localhost:3000/gather-and-join/
pnpm build        # → build/, the same build CI publishes
pnpm lint         # eslint
pnpm typecheck    # tsc
```

Every push to `docs` and every pull request into it runs lint, typecheck and
build (`.github/workflows/ci.yml`); the deploy only happens if they pass.
Broken links and anchors fail the build, so a renamed heading is caught in CI.

Content: `docs/` (the guide), `src/pages/privacy.md` (the store listing's
privacy policy), `src/pages/index.tsx` (landing page). Styling follows the
design system in `docs/design-system` on `main`; brand assets and fonts under
`static/` are copies of it.

Before the first deploy, set Pages → Source to **GitHub Actions** in the repository settings.

Contribution guidelines, the code of conduct and the issue templates live on
`main`, which is where GitHub reads them from for the whole repository.
