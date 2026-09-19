import { defineConfig } from '@playwright/test';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
// Test servers use high ports so a dev server (or anything else) on 8080/4173 never collides.
export const TEST_SERVER_PORT = Number(process.env.TEST_SERVER_PORT ?? 18080);
export const TEST_PLAYER_PORT = Number(process.env.TEST_PLAYER_PORT ?? 14173);
// GJ_REUSE_SERVERS=1 runs the suite against servers you started yourself (e.g. the dev servers on 8080/4173).
const REUSE = process.env.GJ_REUSE_SERVERS === '1';
process.env.SERVER_URL ??= `ws://localhost:${TEST_SERVER_PORT}`;
process.env.PLAYER_ORIGIN ??= `http://localhost:${TEST_PLAYER_PORT}`;

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
      command: 'node --experimental-strip-types src/index.ts',
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
