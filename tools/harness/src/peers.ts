/**
 * Launch N Chrome instances, each with its own profile, extension copy, fake
 * mic/camera fixtures and fixed peerId, all pointed at the local server and
 * fake player. Used by the Playwright suite and by `pnpm launch` for humans.
 */
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { ensurePeerFixtures } from './fixtures.ts';
import { PLAYER_ORIGIN, SERVER_URL } from './endpoints.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
export const EXT_DIR = path.join(ROOT, 'apps', 'extension', '.output-test', 'chrome-mv3');
export { PLAYER_ORIGIN, SERVER_URL } from './endpoints.ts';
export const EPISODE = (n: number) => `urn:hbo:episode:G000000${n}`;
export const watchUrl = (contentId: string) => `${PLAYER_ORIGIN}/watch/${contentId}`;
/** The Drive-shaped page: same content ids, but the media is in a cross-origin iframe. */
export const driveWatchUrl = (contentId: string) => `${PLAYER_ORIGIN}/drivewatch/${contentId}`;
export type PlayerShape = 'hbo' | 'drive';

export type Sabotage = 'reattach' | 'drift' | 'offscreen' | 'echo-suppress' | null;

export type Peer = {
  index: number;
  peerId: string;
  name: string;
  context: BrowserContext;
  page: Page;
  extensionId: string;
  userDataDir: string;
  /** Call a `window.__gj` method on the player page. */
  gj<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
  /** Evaluate against the extension's popup page (has chrome.* APIs). */
  extPage: Page;
};

export type LaunchOptions = { headless?: boolean; sabotage?: Sabotage; profileRoot?: string; slowMo?: number; continuousTone?: boolean; /** Use the machine's real mic/camera instead of fixtures (feel checks). */ realMedia?: boolean };

/** Sabotage flag from the environment (`GJ_SABOTAGE=reattach pnpm test:e2e`), unless a caller overrides it. */
const ENV_SABOTAGE = ((process.env.GJ_SABOTAGE || null) as Sabotage);

export const PROFILE_ROOT = path.join(import.meta.dirname, '..', '.profiles');

/** Profiles of peers this process launched, so an abrupt exit still cleans up after itself. */
const ownedProfiles = new Set<string>();
let sweeperInstalled = false;
function installSweeper() {
  if (sweeperInstalled) return;
  sweeperInstalled = true;
  const sweep = () => { for (const dir of ownedProfiles) fs.rmSync(dir, { recursive: true, force: true }); };
  process.on('exit', sweep);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { sweep(); process.exit(1); });
}

export async function launchPeer(index: number, opts: LaunchOptions = {}): Promise<Peer> {
  const { wav, y4m } = ensurePeerFixtures(index, opts.continuousTone ?? false);
  const sabotage = opts.sabotage === undefined ? ENV_SABOTAGE : opts.sabotage;
  const peerId = `peer${index + 1}`;
  const profileRoot = opts.profileRoot ?? PROFILE_ROOT;
  const userDataDir = path.join(profileRoot, `${peerId}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  installSweeper();
  ownedProfiles.add(userDataDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: opts.headless ?? true,
    slowMo: opts.slowMo,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      ...(opts.realMedia ? [] : [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${wav}`,
        `--use-file-for-fake-video-capture=${y4m}`,
      ]),
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
    viewport: { width: 900, height: 600 },
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const extensionId = new URL(sw.url()).host;

  // Test configuration lives in chrome.storage.local; set it before any player page loads.
  const extPage = await context.newPage();
  await extPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await extPage.evaluate(
    ({ peerId, sabotage, serverUrl }) => chrome.storage.local.set({ testPeerId: peerId, sabotage, serverUrl, name: peerId, ducking: true }),
    { peerId, sabotage, serverUrl: SERVER_URL },
  );
  // Host candidates only. Two peers on one machine need no STUN, and reaching for a
  // public one puts a network round-trip (and its failure modes) in every connection.
  await extPage.evaluate(() => chrome.storage.local.set({ iceServers: [] }));

  const page = await context.newPage();
  const peer: Peer = {
    index, peerId, name: peerId, context, page, extensionId, extPage, userDataDir,
    gj: (method, ...args) => peer.page.evaluate(([m, a]) => (window as any).__gj[m](...a), [method, args] as const),
  };
  return peer;
}

/** Navigate a peer's player page and wait for the extension hook to be live. */
export async function openPlayer(peer: Peer, contentId = EPISODE(1), shape: PlayerShape = 'hbo') {
  await peer.page.goto(shape === 'drive' ? driveWatchUrl(contentId) : watchUrl(contentId));
  await waitForHook(peer);
}

export async function waitForHook(peer: Peer, timeout = 15_000) {
  await peer.page.waitForFunction(() => typeof (window as any).__gj?.ping === 'function', null, { timeout });
  await waitForCondition(async () => (await peer.gj('ping').catch(() => null)) === 'pong', { timeout, label: 'content script bridge' });
}

export async function closePeers(peers: Peer[]) {
  await Promise.all(peers.map(async (p) => {
    await p.context.close().catch((e) => console.warn(`[peers] context close failed: ${String(e)}`));
    fs.rmSync(p.userDataDir, { recursive: true, force: true });
    ownedProfiles.delete(p.userDataDir);
  }));
}

/** The only sanctioned way to wait: poll a condition, fail loudly on timeout. */
export async function waitForCondition(
  fn: () => Promise<boolean> | boolean,
  { timeout = 10_000, interval = 100, label = 'condition' }: { timeout?: number; interval?: number; label?: string } = {},
): Promise<void> {
  const t0 = Date.now();
  let lastErr: unknown = null;
  let polls = 0;
  const errorCounts = new Map<string, number>();
  while (Date.now() - t0 < timeout) {
    polls++;
    try { if (await fn()) return; } catch (e) {
      lastErr = e;
      const key = String(e);
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  // Which error dominated matters more than which came last, and a low poll count means the
  // predicate was barely sampled (a slow bridge), not that the condition stayed false.
  const worst = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const detail = worst ? ` (${worst[1]}/${polls} polls: ${worst[0]})` : lastErr ? ` (last error: ${String(lastErr)})` : '';
  throw new Error(`timed out after ${timeout}ms waiting for ${label} after ${polls} polls${detail}`);
}

export const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
