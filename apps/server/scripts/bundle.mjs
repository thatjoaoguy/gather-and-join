/**
 * Bundles the server into one file that runs on a bare Node with nothing installed:
 * `node gj-server.mjs`. Attached to every GitHub release and copied into the
 * container image, so hosting never requires cloning this repo.
 *
 * Deliberately not minified — it is the artifact strangers are asked to download
 * and run, and it should stay readable. `ws` is MIT; its notices are kept inline.
 */
import { build } from 'esbuild';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const outfile = join(pkgDir, 'dist', 'gj-server.mjs');

await build({
  entryPoints: [join(pkgDir, 'src', 'main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'inline',
  define: { __GJ_VERSION__: JSON.stringify(version) },
  // `ws` requires both inside a try/catch to pick up native speedups when present.
  // Left unresolved on purpose: the bundle throws there and ws falls back to JS.
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    // `ws` is CommonJS and reaches for `require` at load time, which an ESM bundle has no
    // global for. esbuild's own shim picks this one up instead of throwing on every builtin.
    js: [
      '#!/usr/bin/env node',
      `// Gather & Join signaling server ${version} — MIT. https://github.com/thatjoaoguy/gather-and-join`,
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
});

console.log(`${outfile} — ${(statSync(outfile).size / 1024).toFixed(0)} KB`);
