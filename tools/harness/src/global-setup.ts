import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ensurePeerFixtures } from './fixtures.ts';
import { PROFILE_ROOT } from './peers.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
export const EXT_DIR = path.join(ROOT, 'apps', 'extension', '.output-test', 'chrome-mv3');

/**
 * Profiles are removed by the peer teardown, which a Playwright test timeout skips: the
 * worker is torn down without unwinding the test body. Left alone they accumulate
 * (293MB across 34 of them when this was written) and slow every later launch.
 */
function pruneProfiles() {
  if (!fs.existsSync(PROFILE_ROOT)) return;
  let removed = 0;
  for (const name of fs.readdirSync(PROFILE_ROOT)) {
    const dir = path.join(PROFILE_ROOT, name);
    // <peerId>-<pid>-<timestamp>; a profile whose process is gone is nobody's.
    const pid = Number(name.split('-')[1]);
    if (Number.isFinite(pid) && pid > 0 && pidAlive(pid)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed++;
  }
  if (removed) console.log(`[global-setup] pruned ${removed} orphaned Chrome profile(s)`);
}

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export default async function globalSetup() {
  pruneProfiles();
  if (process.env.GJ_SKIP_BUILD !== '1' || !fs.existsSync(EXT_DIR)) {
    execSync('pnpm exec wxt build', {
      cwd: path.join(ROOT, 'apps', 'extension'),
      stdio: 'inherit',
      env: { ...process.env, GJ_TEST: '1' },
      // A hung build otherwise hangs the run before a single test reports.
      timeout: 5 * 60_000,
    });
  }
  // Both variants up front: created lazily, concurrent sabotage rows race to write them.
  for (let i = 0; i < 4; i++) { ensurePeerFixtures(i, false); ensurePeerFixtures(i, true); }
}
