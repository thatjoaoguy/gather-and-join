/**
 * Negative controls (§10): run the e2e suite once per sabotage flag and assert
 * that exactly the tests guarding that mechanism fail while the rest pass.
 * A test that cannot be made to fail is not accepted.
 *
 *   pnpm test:sabotage            # whole matrix, rows in parallel on separate ports
 *   pnpm test:sabotage reattach   # one flag
 *   GJ_SABOTAGE_PARALLEL=1 pnpm test:sabotage   # rows one after another (small machines)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_SERVER_PORT, TEST_PLAYER_PORT } from './endpoints.ts';

const HERE = import.meta.dirname;

/** Which tests MUST fail under each flag (matched by title substring). Everything else must pass. */
const MATRIX: Record<string, string[]> = {
  'reattach': ['element re-attach', 'quality switch'],
  'drift': ['small drift'],
  // Every test that asserts the room survives an episode transition fails when the offscreen document dies on navigation.
  'offscreen': ['navigation survival', 'leader authority'],
  // Without tagging, the follower's own corrective seeks are rebroadcast and move the room, so
  // every test that expects the follower to converge onto a fixed room position also fails.
  'echo-suppress': ['echo suppression', 'large drift', 'small drift', 'quality switch'],
};

/**
 * Tests excluded from the sabotage runs because they are slow and not affected by any flag.
 * Fragments must be specific enough not to catch a test another row needs: 'ad break' alone
 * would also swallow reattach.spec.ts's 'quality switch and ad break', which two rows expect.
 */
const SKIP_UNDER_SABOTAGE = ['sync accuracy', 'late join', 'ducking', 'perfect negotiation', 'autoplay-next', 'same-element ad break'];

/**
 * Tests excluded under one flag only. The service-worker test kills the worker right
 * before the navigation that the offscreen sabotage hooks, so whether the (restarting)
 * worker closes the offscreen document before the new content script reaches it is a
 * race inside Chrome: the test passes about one run in three under the flag. The offscreen
 * mechanism is demonstrated deterministically by the two tests that remain in its row.
 */
const SKIP_UNDER_FLAG: Record<string, string[]> = { offscreen: ['service worker termination'] };

type Result = { title: string; status: string };

const BASE_SERVER_PORT = TEST_SERVER_PORT;
const BASE_PLAYER_PORT = TEST_PLAYER_PORT;
/**
 * Rows run concurrently, each on its own ports. Every row drives 2-3 Chrome instances
 * doing WebRTC, so on a small machine 4 rows at once turn the timing assertions into
 * coin flips — and a row scores load-induced slowness as "mechanism not demonstrated".
 * Budget ~4 cores per row.
 */
const PARALLEL = Math.max(1, Number(process.env.GJ_SABOTAGE_PARALLEL ?? Math.min(4, Math.floor(os.cpus().length / 4))));
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One suite run, isolated from the others: own ports, own Playwright output dir, own log file. */
/** Every `playwright test` this process spawned, so an early exit does not orphan them. */
const children = new Set<ChildProcess>();
let killerInstalled = false;
function installKiller() {
  if (killerInstalled) return;
  killerInstalled = true;
  const killAll = () => { for (const c of children) { try { c.kill('SIGTERM'); } catch { /* already gone */ } } };
  process.on('exit', killAll);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { killAll(); process.exit(1); });
}

/** The environment one sabotage row runs under. */
function rowEnv(sabotage: string, slot: number, resultsFile: string) {
  return {
    GJ_SABOTAGE: sabotage, GJ_SKIP_BUILD: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: resultsFile,
    TEST_SERVER_PORT: String(BASE_SERVER_PORT + slot * 10), TEST_PLAYER_PORT: String(BASE_PLAYER_PORT + slot * 10),
    // Expected failures skip the diagnostic dump (its calls crawl against a page the sabotage has jammed), and
    // every test gets a shorter cap: the slowest passing test is ~40s, and an expected failure needs no more.
    GJ_EXPECT_FAIL: MATRIX[sabotage]!.map(esc).join('|'),
    GJ_TEST_TIMEOUT_MS: '100000',
  };
}

function runSuite(sabotage: string, slot: number): Promise<{ results: Result[]; log: string; seconds: number }> {
  const root = path.join(HERE, '..');
  const logDir = path.join(root, 'test-results', 'sabotage-logs');
  fs.mkdirSync(logDir, { recursive: true });
  const resultsFile = path.join(logDir, `results-${sabotage}.json`);
  const logFile = path.join(logDir, `${sabotage}.log`);
  const grepInvert = [...SKIP_UNDER_SABOTAGE, ...(SKIP_UNDER_FLAG[sabotage] ?? [])].map(esc).join('|');
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const out = fs.openSync(logFile, 'w');
    installKiller();
    // Each row runs on its own ports and so must derive its own URLs; inherited, they would pin every row to the parent's.
    const env: NodeJS.ProcessEnv = { ...process.env, ...rowEnv(sabotage, slot, resultsFile) };
    delete env.SERVER_URL;
    delete env.PLAYER_ORIGIN;
    const child = spawn('pnpm', ['exec', 'playwright', 'test', '--grep-invert', grepInvert, '--reporter=list,json', '--output', `test-results/sabotage-${sabotage}`], {
      cwd: root,
      env,
      stdio: ['ignore', out, out],
    });
    children.add(child);
    child.on('error', (err) => { children.delete(child); reject(err); });
    child.on('exit', (code) => {
      children.delete(child);
      fs.closeSync(out);
      if (!fs.existsSync(resultsFile)) { reject(new Error(`no results file for ${sabotage} (exit ${code}); see ${logFile}`)); return; }
      const json = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
      const results: Result[] = [];
      const walk = (suite: any) => {
        for (const spec of suite.specs ?? []) results.push({ title: spec.title, status: spec.ok ? 'passed' : 'failed' });
        for (const s of suite.suites ?? []) walk(s);
      };
      for (const s of json.suites ?? []) walk(s);
      resolve({ results, log: logFile, seconds: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

const flags = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MATRIX);
for (const flag of flags) if (!MATRIX[flag]) { console.error(`unknown sabotage flag ${flag}`); process.exit(2); }

let ok = true;
const t0 = Date.now();
console.log(`sabotage matrix: ${flags.join(', ')} · ${Math.min(PARALLEL, flags.length)} at a time`);
// A small worker pool: each flag takes the next free slot (its ports) when one frees up.
const queue = [...flags];
const slotsFree = Array.from({ length: Math.min(PARALLEL, flags.length) }, (_, i) => i);
const done: Promise<void>[] = [];
const runNext = (): Promise<void> | null => {
  const flag = queue.shift();
  if (flag === undefined) return null;
  const slot = slotsFree.shift()!;
  return runSuite(flag, slot).then(({ results, log, seconds }) => {
    const mustFail = MATRIX[flag]!;
    console.log(`\n=== GJ_SABOTAGE=${flag} (${seconds}s, log: ${path.relative(process.cwd(), log)}) ===`);
    for (const r of results) {
      const expectedFail = mustFail.some((m) => r.title.includes(m));
      const good = expectedFail ? r.status === 'failed' : r.status === 'passed';
      if (!good) ok = false;
      console.log(`${good ? '  ok ' : '  BAD'} ${r.title} → ${r.status}${expectedFail ? ' (must fail)' : ''}`);
    }
    for (const m of mustFail) if (!results.some((r) => r.title.includes(m))) { ok = false; console.log(`  BAD no test matched "${m}"`); }
  }).finally(() => { slotsFree.push(slot); const next = runNext(); if (next) done.push(next); });
};
for (let i = 0; i < slotsFree.length; i++) { const p = runNext(); if (p) done.push(p); }
// `done` grows as slots free up; drain until it stops growing. Settled, not raced: a row
// that dies (port in use, crashed driver) must not leave the others running unattended.
for (let i = 0; i < done.length; i++) {
  const outcome = await Promise.allSettled([done[i]]);
  if (outcome[0]!.status === 'rejected') { ok = false; console.log(`  BAD row failed to run: ${String(outcome[0]!.reason)}`); }
}
console.log(`\n${ok ? 'sabotage matrix: all mechanisms demonstrated' : 'sabotage matrix: FAILED'} · ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(ok ? 0 : 1);
