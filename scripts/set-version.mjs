// Sets one version on the root and every workspace package.json. semantic-release
// runs it during a release (see .releaserc.json); WXT reads the extension's copy.
// Usage: node scripts/set-version.mjs 1.2.3
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error(`Not a semver version: ${version}`);
  process.exit(1);
}

// Keep in step with pnpm-workspace.yaml.
const workspaces = ['apps', 'packages', 'tools'];
const files = ['package.json'];
for (const dir of workspaces) {
  for (const pkg of readdirSync(dir)) {
    const file = join(dir, pkg, 'package.json');
    if (existsSync(file)) files.push(file);
  }
}

for (const file of files) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = version;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`${file} → ${version}`);
}
