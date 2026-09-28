import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { TEST_SERVER_PORT, TEST_PLAYER_PORT, assertEndpointsAgree } from './src/endpoints.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
// GJ_REUSE_SERVERS=1 runs the suite against servers you started yourself (e.g. the dev servers on 8080/4173).
const REUSE = process.env.GJ_REUSE_SERVERS === '1';
// Ports and URLs come from endpoints.ts, so nothing here can disagree with peers.ts.
if (!REUSE) assertEndpointsAgree();
export { TEST_SERVER_PORT, TEST_PLAYER_PORT };

export default defineConfig({
  testDir: './tests',
  // Every test launches its own set of Chrome instances and uses fixed room codes: serial only.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: Number(process.env.GJ_TEST_TIMEOUT_MS ?? 180_000),
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'test-results/results.json' }]] : [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  globalSetup: './src/global-setup.ts',
  use: { trace: 'off' },
  webServer: [
    {
      command: 'node --experimental-strip-types src/main.ts',
      cwd: path.join(ROOT, 'apps', 'server'),
      port: TEST_SERVER_PORT,
      reuseExistingServer: REUSE,
      env: { PORT: String(TEST_SERVER_PORT), ROOM_TTL_MS: '60000' },
    },
    {
      command: 'node --experimental-strip-types src/player-server.ts',
      cwd: import.meta.dirname,
      url: `http://localhost:${TEST_PLAYER_PORT}/watch/urn:hbo:episode:G0000001`,
      reuseExistingServer: REUSE,
      env: { PLAYER_PORT: String(TEST_PLAYER_PORT) },
    },
  ],
});
