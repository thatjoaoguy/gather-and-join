# Container image for the signaling server. Built and pushed by .github/workflows/packaging.yml;
# `docker build -f apps/server/Dockerfile .` from the repo root reproduces it.
#
# The build stage bundles everything into one file with no runtime dependencies, so the
# final image is a Node base plus ~140 KB — no node_modules, no pnpm, no source tree.

# $BUILDPLATFORM pins this stage to the runner's own architecture. The bundle it produces is
# plain JavaScript, identical on every platform, so the arm64 image needs no emulated build.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /src
RUN npm install -g pnpm@12.4.2
# Manifests first: this layer only re-runs when a dependency actually changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
# The extension and harness are not needed to build the server, and installing them
# would pull Playwright browsers into an image that never runs a test.
RUN pnpm install --frozen-lockfile --filter @gj/server...
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY tsconfig.base.json ./
RUN pnpm --filter @gj/server build

FROM node:26-alpine
# Rooms live in memory and nothing is ever written to disk, so the process needs no
# write access to anything: run as the base image's unprivileged user.
USER node
WORKDIR /app
COPY --from=build --chown=node:node /src/apps/server/dist/gj-server.mjs ./gj-server.mjs
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
# Same endpoint the hosting platforms are pointed at, so a bad build fails everywhere alike.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "gj-server.mjs"]
