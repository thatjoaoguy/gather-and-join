/**
 * Entrypoint for every way the server ships: `pnpm start`, the bundled
 * `gj-server.mjs`, and the container image. `index.ts` stays a library so the
 * tests can start and stop it in-process.
 */
import { startServer } from './index.ts';

const server = startServer();

// Docker, Render and systemd all stop a process with SIGTERM and lose patience after
// ~10s. Closing on the first signal exits immediately instead of being killed.
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    server.close().then(() => process.exit(0));
  });
}
