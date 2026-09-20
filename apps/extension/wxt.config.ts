import { defineConfig } from 'wxt';
import { resolve } from 'node:path';
import { PLAYER_MATCHES, harness } from '@gj/shared';

// GJ_TEST=1 enables the in-page test hook + sabotage flags. It is a build-time
// gate so neither can ship in a normal build.
const TEST_BUILD = process.env.GJ_TEST === '1';

// One pattern per provider in packages/shared/src/providers.ts. The harness
// (localhost fake player) is a provider too, but only test builds may match it:
// a production manifest with localhost hosts reads as an unexplained permission.
const isHarness = (m: string) => harness.matches.includes(m);
const MATCHES = TEST_BUILD ? [...PLAYER_MATCHES] : PLAYER_MATCHES.filter((m) => !isHarness(m));

// web_accessible_resources match patterns must have a path of exactly `/*`:
// Chrome rejects anything narrower with "Invalid match pattern", unlike
// host_permissions and content-script matches, which accept a path. So the
// fonts are exposed per origin even where the content script is path-scoped.
const originMatch = (m: string) => {
  const slash = m.indexOf('/', m.indexOf('://') + 3);
  return (slash === -1 ? m : m.slice(0, slash)) + '/*';
};
const WAR_MATCHES = [...new Set(MATCHES.map(originMatch))];

const DESIGN_SYSTEM = resolve(__dirname, '../../docs/design-system');
const DESIGN_SYSTEM_ASSETS = {
  fonts: ['quicksand-400.ttf', 'quicksand-500.ttf', 'quicksand-600.ttf', 'quicksand-700.ttf', 'quicksand-LICENSE.txt'],
  brand: ['lockup.svg', 'mark.svg'],
};

export default defineConfig({
  srcDir: '.',
  imports: false,
  outDir: TEST_BUILD ? '.output-test' : '.output',
  // The test hook entrypoint only exists in test builds.
  filterEntrypoints: TEST_BUILD ? undefined : ['background', 'player', 'offscreen', 'popup', 'options'],
  manifest: {
    name: TEST_BUILD ? 'Gather & Join (test build)' : 'Gather & Join',
    description: 'Watch together in sync, with voice and video, on HBO Max and Google Drive. Everyone plays from their own account.',
    permissions: ['offscreen', 'storage', 'tabs', 'webNavigation', 'scripting'],
    host_permissions: MATCHES,
    // The participant HUD declares Quicksand in the host document (a shadow root cannot), so the font files must be fetchable from player pages.
    web_accessible_resources: [{ resources: ['fonts/*'], matches: WAR_MATCHES }],
  },
  hooks: {
    // The content script declares the shared PLAYER_MATCHES; strip the harness from production.
    'build:manifestGenerated': (_wxt, manifest) => {
      if (!TEST_BUILD) {
        for (const cs of manifest.content_scripts ?? []) cs.matches = cs.matches?.filter((m) => !isHarness(m));
      }
      // Chrome rejects a web_accessible_resources pattern whose path is
      // narrower than `/*` ("Invalid value for 'web_accessible_resources[0]'.
      // Invalid match pattern."), and refuses to load the extension at all.
      // Nothing else catches it: the manifest is only parsed by Chrome, so
      // lint, typecheck and the unit tests all pass while the build is broken.
      for (const [i, war] of (manifest.web_accessible_resources ?? []).entries()) {
        for (const m of (war as { matches?: string[] }).matches ?? []) {
          if (!m.endsWith('://*/*') && !/^[a-z*]+:\/\/[^/]+\/\*$/.test(m))
            throw new Error(`web_accessible_resources[${i}] pattern ${m} has a path narrower than /*; Chrome will refuse to load the extension`);
        }
      }
    },
    // Fonts and brand marks are owned by the design system; copy them into the
    // package at build time instead of keeping a second copy under public/.
    'build:publicAssets': (_wxt, files) => {
      for (const [dir, names] of Object.entries(DESIGN_SYSTEM_ASSETS)) {
        for (const name of names) files.push({ absoluteSrc: resolve(DESIGN_SYSTEM, dir, name), relativeDest: `${dir}/${name}` });
      }
    },
  },
  vite: () => ({
    define: {
      __GJ_TEST__: JSON.stringify(TEST_BUILD),
    },
  }),
});
