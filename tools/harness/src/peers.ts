/**
 * Launch N Chrome instances, each with its own profile, extension copy, fake
 * mic/camera fixtures and fixed peerId, all pointed at the local server and
 * fake player. Used by the Playwright suite and by `pnpm launch` for humans.
 */
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { ensurePeerFixtures } from './fixtures.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
export const EXT_DIR = path.join(ROOT, 'apps', 'extension', '.output-test', 'chrome-mv3');
export const PLAYER_ORIGIN = process.env.PLAYER_ORIGIN ?? 'http://localhost:4173';
export const SERVER_URL = process.env.SERVER_URL ?? 'ws://localhost:8080';
export const EPISODE = (n: number) => `urn:hbo:episode:G000000${n}`;
export const watchUrl = (contentId: string) => `${PLAYER_ORIGIN}/watch/${contentId}`;

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

export async function launchPeer(index: number, opts: LaunchOptions = {}): Promise<Peer> {
  const { wav, y4m } = ensurePeerFixtures(index, opts.continuousTone ?? false);
  const sabotage = opts.sabotage === undefined ? ENV_SABOTAGE : opts.sabotage;
  const peerId = `peer${index + 1}`;
  const profileRoot = opts.profileRoot ?? path.join(import.meta.dirname, '..', '.profiles');
  const userDataDir = path.join(profileRoot, `${peerId}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

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

  const page = await context.newPage();
  const peer: Peer = {
    index, peerId, name: peerId, context, page, extensionId, extPage, userDataDir,
    gj: (method, ...args) => peer.page.evaluate(([m, a]) => (window as any).__gj[m](...a), [method, args] as const),
  };
  return peer;
}

/** Navigate a peer's player page and wait for the extension hook to be live. */
export async function openPlayer(peer: Peer, contentId = EPISODE(1)) {
  await peer.page.goto(watchUrl(contentId));
  await waitForHook(peer);
}

export async function waitForHook(peer: Peer, timeout = 15_000) {
  await peer.page.waitForFunction(() => typeof (window as any).__gj?.ping === 'function', null, { timeout });
  await waitForCondition(async () => (await peer.gj('ping').catch(() => null)) === 'pong', { timeout, label: 'content script bridge' });
}

export async function closePeers(peers: Peer[]) {
  await Promise.all(peers.map(async (p) => {
    await p.context.close().catch(() => {});
    fs.rmSync(p.userDataDir, { recursive: true, force: true });
  }));
}

/** The only sanctioned way to wait: poll a condition, fail loudly on timeout. */
export async function waitForCondition(
  fn: () => Promise<boolean> | boolean,
  { timeout = 10_000, interval = 100, label = 'condition' }: { timeout?: number; interval?: number; label?: string } = {},
): Promise<void> {
  const t0 = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - t0 < timeout) {
    try { if (await fn()) return; } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${label}${lastErr ? ` (last error: ${String(lastErr)})` : ''}`);
}

export const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
