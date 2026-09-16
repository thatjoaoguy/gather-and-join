import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ensurePeerFixtures } from './fixtures.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
export const EXT_DIR = path.join(ROOT, 'apps', 'extension', '.output-test', 'chrome-mv3');

export default async function globalSetup() {
  if (process.env.GAJ_SKIP_BUILD !== '1' || !fs.existsSync(EXT_DIR)) {
    execSync('pnpm exec wxt build', { cwd: path.join(ROOT, 'apps', 'extension'), stdio: 'inherit', env: { ...process.env, GAJ_TEST: '1' } });
  }
  for (let i = 0; i < 4; i++) ensurePeerFixtures(i);
}
