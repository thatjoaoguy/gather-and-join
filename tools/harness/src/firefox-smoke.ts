/**
 * The Firefox build, end to end, against a Chrome peer: install, join, the call both
 * ways, play/pause sync, cameras into the page tiles, and the room surviving a reload,
 * a client-side route and the leader's episode change.
 *
 *   pnpm --filter @gj/harness smoke:firefox
 *   GJ_SKIP_BUILD=1 FIREFOX_BIN=/path/to/firefox pnpm --filter @gj/harness smoke:firefox
 *
 * Not a Playwright test: Playwright cannot load an extension into Firefox. Firefox is
 * driven over WebDriver BiDi instead (`webExtension.install`), with its fake media on.
 *
 * Permission checks stay on, with the microphone and camera allowed the way a grant on
 * the setup page leaves them. Switching the checks off (media.navigator.permission.disabled)
 * hides the one thing this script exists to catch: Firefox refuses getUserMedia in a
 * background page whatever the permission, which is why the pinned call tab captures.
 *
 * Automation cannot open a moz-extension:// page, so unlike a Chrome peer the Firefox
 * peer cannot be pointed at a test server: it uses the extension's default,
 * ws://localhost:8080. The signaling server runs there (or `pnpm dev:server` is reused).
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { generateRoomCode } from '@gj/shared';
import type { Peer } from './peers.ts';

const DEFAULT_SERVER_PORT = 8080;
// Before the harness modules read it: the Chrome peer has to meet Firefox on that server.
process.env.TEST_SERVER_PORT = String(DEFAULT_SERVER_PORT);
const { launchPeer, openPlayer, waitForCondition, closePeers, watchUrl, EPISODE } = await import('./peers.ts');
const { startPlayerServer } = await import('./player-server.ts');
const { TEST_PLAYER_PORT } = await import('./endpoints.ts');

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const EXT_ROOT = path.join(ROOT, 'apps', 'extension');
const FIREFOX_EXT = path.join(EXT_ROOT, '.output-test', 'firefox-mv2');
const CHROME_EXT = path.join(EXT_ROOT, '.output-test', 'chrome-mv3');
const FIREFOX_BIN = process.env.FIREFOX_BIN ?? (process.platform === 'darwin' ? '/Applications/Firefox.app/Contents/MacOS/firefox' : 'firefox');
// What the fake media sends: Chrome peer 1's fixture is a 440 Hz tone (on 2 s of every 8)
// and a red frame; Firefox's fake microphone is a steady 1 kHz tone.
const CHROME_TONE_HZ = 440, FIREFOX_TONE_HZ = 1000, CHROME_RGB = [220, 40, 40];

const results: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail?: unknown) {
  results.push({ name, ok });
  const text = detail === undefined ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${text ? `  ${text}` : ''}`);
}
const passes = (p: Promise<unknown>) => p.then(() => true, () => false);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

/** Just enough of WebDriver BiDi: commands with results, no events. */
class Bidi {
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private readonly ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      const p = m.id !== undefined ? this.pending.get(m.id) : undefined;
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === 'error') p.reject(new Error(`${m.error}: ${m.message}`)); else p.resolve(m.result);
    };
  }
  static async connect(url: string): Promise<Bidi> {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error(`cannot connect to ${url}`)); });
    return new Bidi(ws);
  }
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  close() { this.ws.close(); }
}

const owned: ChildProcess[] = [];
let firefox: ChildProcess | null = null;
let chrome: Peer | null = null;
let playerServer: { close(): void } | null = null;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gj-firefox-'));
let firefoxOutput = '';

try {
  if (process.env.GJ_SKIP_BUILD !== '1' || !fs.existsSync(FIREFOX_EXT) || !fs.existsSync(CHROME_EXT)) {
    for (const browser of ['chrome', 'firefox']) {
      execSync(`pnpm exec wxt build -b ${browser}`, { cwd: EXT_ROOT, stdio: 'inherit', env: { ...process.env, GJ_TEST: '1' }, timeout: 5 * 60_000 });
    }
  }

  if (!(await listening(DEFAULT_SERVER_PORT))) {
    const server = spawn('node', ['--experimental-strip-types', 'src/main.ts'], { cwd: path.join(ROOT, 'apps', 'server'), env: { ...process.env, PORT: String(DEFAULT_SERVER_PORT), ROOM_TTL_MS: '60000' }, stdio: 'ignore' });
    owned.push(server);
    await waitForCondition(() => listening(DEFAULT_SERVER_PORT), { timeout: 15_000, label: `signaling server on :${DEFAULT_SERVER_PORT}` });
  }
  if (!(await listening(TEST_PLAYER_PORT))) playerServer = await startPlayerServer(TEST_PLAYER_PORT);

  // ---- Firefox: a throwaway profile, fake media, the mic and camera already allowed ----
  fs.writeFileSync(path.join(profile, 'user.js'), Object.entries({
    'media.navigator.streams.fake': true, 'permissions.default.microphone': 1, 'permissions.default.camera': 1,
    'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0,
    // Both peers are on this machine; let ICE use the loopback interface.
    'media.peerconnection.ice.loopback': true,
    'browser.shell.checkDefaultBrowser': false, 'datareporting.policy.dataSubmissionEnabled': false, 'toolkit.telemetry.reportingpolicy.firstRun': false,
  }).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
  firefox = spawn(FIREFOX_BIN, ['--headless', '--no-remote', '--profile', profile, '--remote-debugging-port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  firefox.stdout!.on('data', (d) => { firefoxOutput += d; });
  firefox.stderr!.on('data', (d) => { firefoxOutput += d; });
  let bidiUrl = '';
  await waitForCondition(() => !!(bidiUrl = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(firefoxOutput)?.[1] ?? ''), { timeout: 30_000, label: `Firefox remote agent (${FIREFOX_BIN})` });
  const bidi = await Bidi.connect(`${bidiUrl}/session`);
  await bidi.send('session.new', { capabilities: {} });
  check('Firefox installs the test build', true, await bidi.send('webExtension.install', { extensionData: { type: 'path', path: FIREFOX_EXT } }));
  const ctx = (await bidi.send('browsingContext.getTree')).contexts[0].context as string;

  // A JSON round-trip: BiDi's own serialization of objects is verbose.
  const ffEval = async (expr: string): Promise<any> => {
    const r = await bidi.send('script.evaluate', { expression: `(async () => JSON.stringify(await (${expr})))()`, target: { context: ctx }, awaitPromise: true });
    if (r.type === 'exception') throw new Error(r.exceptionDetails?.text ?? 'exception in Firefox');
    return r.result.value === undefined ? undefined : JSON.parse(r.result.value);
  };
  const ffGj = (method: string, ...args: unknown[]) => ffEval(`window.__gj.${method}(...${JSON.stringify(args)})`);
  const ffBridged = () => passes(waitForCondition(async () => (await ffGj('ping').catch(() => null)) === 'pong', { timeout: 10_000, label: 'Firefox bridge' }));

  // The background page registers the player script after install; a page loaded first gets none.
  const t0 = Date.now();
  let bridged = false;
  while (!bridged && Date.now() - t0 < 30_000) {
    await bidi.send('browsingContext.navigate', { context: ctx, url: watchUrl(EPISODE(1)), wait: 'complete' });
    bridged = await ffBridged();
  }
  check('Firefox: player script reaches the background page', bridged, `${Date.now() - t0}ms`);
  if (!bridged) throw new Error('the Firefox player page never reached the extension');

  // ---- the room: Chrome creates it, Firefox joins -----------------------------------
  chrome = await launchPeer(0, { headless: true, sabotage: null });
  await openPlayer(chrome);
  const code = generateRoomCode();
  await chrome.gj('createRoom', code, 'chrome');
  await waitForCondition(async () => (await chrome!.gj('getSnapshot') as any)?.room?.code === code, { timeout: 20_000, label: 'Chrome in the room' });
  await ffGj('joinRoom', code, 'firefox');
  let ffSnap: any = null;
  const joined = await passes(waitForCondition(async () => (ffSnap = await ffGj('getSnapshot'))?.room?.code === code, { timeout: 20_000, label: 'Firefox in the room' }));
  check('Firefox joins the room', joined, { socket: ffSnap?.socket, lastError: ffSnap?.lastError ?? null });
  if (!joined) throw new Error('Firefox never joined');
  const ffId = ffSnap.yourPeerId as string;
  const chromeId = chrome.peerId;

  // ---- the call -----------------------------------------------------------------------
  let cSnap: any = null;
  const meshUp = await passes(waitForCondition(async () => {
    ffSnap = await ffGj('getSnapshot'); cSnap = await chrome!.gj('getSnapshot');
    return ffSnap?.peerMedia?.[chromeId]?.connectionState === 'connected' && cSnap?.peerMedia?.[ffId]?.connectionState === 'connected';
  }, { timeout: 20_000, label: 'mesh' }));
  check('WebRTC connects Firefox and Chrome', meshUp, { firefoxSees: ffSnap?.peerMedia?.[chromeId]?.connectionState, chromeSees: cSnap?.peerMedia?.[ffId]?.connectionState });
  const tabs = (await bidi.send('browsingContext.getTree')).contexts.map((c: { url: string }) => c.url) as string[];
  check('Firefox opened the pinned call tab', tabs.some((u) => u.endsWith('/call.html')), tabs);
  // The tab starts capturing once the room is up; give it the moment that takes.
  const micUp = await passes(waitForCondition(async () => { cSnap = await chrome!.gj('getSnapshot'); return cSnap?.peerMedia?.[ffId]?.micOn === true && cSnap?.peerMedia?.[ffId]?.hasAudio === true; }, { timeout: 15_000, label: 'Firefox mic' }));
  check('Firefox\'s mic is on (captured by the call tab)', micUp, { chromeSeesFirefox: { micOn: cSnap?.peerMedia?.[ffId]?.micOn, hasAudio: cSnap?.peerMedia?.[ffId]?.hasAudio } });

  // media.spec.ts's rule: the right tone within 25 Hz, above -60 dB, at some poll.
  const hears = (get: () => Promise<any>, hz: number) => {
    let last: any = null;
    return passes(waitForCondition(async () => { last = await get(); return Math.abs((last?.peakHz ?? 0) - hz) <= 25 && last.level > -60; }, { timeout: 20_000, label: `${hz} Hz` })).then((ok) => ({ ok, last }));
  };
  const ffHears = await hears(async () => (await ffGj('getRemoteAudio'))?.[chromeId], CHROME_TONE_HZ);
  check(`Firefox hears Chrome's ${CHROME_TONE_HZ} Hz tone`, ffHears.ok, ffHears.last);
  const cHears = await hears(async () => (await chrome!.gj('getRemoteAudio') as any)?.[ffId], FIREFOX_TONE_HZ);
  check(`Chrome hears Firefox's ${FIREFOX_TONE_HZ} Hz tone`, cHears.ok, cHears.last);

  // ---- sync -----------------------------------------------------------------------------
  await chrome.page.click('#play');
  check('Chrome\'s play reaches Firefox', await passes(waitForCondition(async () => (await ffGj('getState'))?.paused === false, { label: 'Firefox plays' })));
  await sleep(4000);
  const [a, b] = [await chrome.gj('getState') as any, await ffGj('getState')];
  const spread = Math.abs((a.positionMs + (Date.now() - a.atUnixMs)) - (b.positionMs + (Date.now() - b.atUnixMs)));
  check('Positions within 400 ms after 4 s of play', spread < 400, `${Math.round(spread)}ms`);
  await ffEval(`document.querySelector('#pause').click()`);
  check('Firefox\'s pause reaches Chrome', await passes(waitForCondition(async () => (await chrome!.gj('getState') as any)?.paused === true, { label: 'Chrome pauses' })));

  // ---- cameras, both ways, into the page tiles (the loopback) -------------------------
  const tile = (sel: string) => `(() => { const v = document.getElementById('gj-tiles')?.shadowRoot?.querySelector(${JSON.stringify(sel)}); return !!v && v.videoWidth > 0; })()`;
  const inChrome = (js: string) => chrome!.page.evaluate(js) as Promise<boolean>;
  await chrome.gj('setCamera', true);
  let v: any = null;
  const red = await passes(waitForCondition(async () => {
    const rgb = (v = (await ffGj('getRemoteVideo'))?.[chromeId])?.rgb as number[] | null | undefined;
    return !!rgb && rgb.every((c, i) => Math.abs(c - CHROME_RGB[i]!) <= 45);
  }, { timeout: 15_000, label: 'Firefox sees red' }));
  const f1 = v?.framesDecoded ?? 0; await sleep(1000); const f2 = (await ffGj('getRemoteVideo'))?.[chromeId]?.framesDecoded ?? 0;
  check('Firefox receives Chrome\'s camera (its colour, frames advancing)', red && f2 > f1, { rgb: v?.rgb, framesDecoded: [f1, f2] });
  check('Firefox\'s page tile renders Chrome\'s video', await passes(waitForCondition(() => ffEval(tile('.tile.has-video:not(.self) video')), { label: 'Firefox tile' })));
  check('Firefox\'s page is narrowed beside the sidebar', (await ffEval('Math.round(document.documentElement.getBoundingClientRect().width) === innerWidth - 240')) === true);
  await ffGj('setCamera', true);
  let cv: any = null;
  const gets = await passes(waitForCondition(async () => ((cv = (await chrome!.gj('getRemoteVideo') as any)?.[ffId])?.framesDecoded ?? 0) > 0, { timeout: 15_000, label: 'Chrome gets Firefox video' }));
  const g1 = cv?.framesDecoded ?? 0; await sleep(1000); const g2 = (await chrome.gj('getRemoteVideo') as any)?.[ffId]?.framesDecoded ?? 0;
  check('Chrome receives Firefox\'s camera (frames advancing)', gets && g2 > g1, { framesDecoded: [g1, g2] });
  check('Chrome\'s page tile renders Firefox\'s video', await passes(waitForCondition(() => inChrome(tile('.tile.has-video:not(.self) video')), { label: 'Chrome tile' })));
  check('Firefox\'s self-view tile renders', await passes(waitForCondition(() => ffEval(tile('.tile.self.has-video video')), { label: 'Firefox self-view' })));
  await chrome.gj('setCamera', false); await ffGj('setCamera', false);
  const noVideo = `!document.getElementById('gj-tiles')?.shadowRoot?.querySelector('.tile.has-video')`;
  check('Camera off: video leaves both pages\' tiles', await passes(waitForCondition(async () => (await ffEval(noVideo)) === true && (await inChrome(noVideo)) === true, { label: 'video gone' })));

  // ---- navigation: the content script dies, the background page keeps the room ----------
  await ffEval(`document.querySelector('#next-push').click()`);
  check('Firefox client-side route: the player follows the new episode', await passes(waitForCondition(async () => (await ffGj('getState'))?.contentId === EPISODE(2), { label: 'Firefox pushState' })));
  await bidi.send('browsingContext.navigate', { context: ctx, url: watchUrl(EPISODE(1)), wait: 'complete' });
  const reloaded = await ffBridged();
  ffSnap = await ffGj('getSnapshot').catch(() => null);
  check('Firefox real page load: same room, same socket, call up', reloaded && ffSnap?.room?.code === code && ffSnap?.socketReconnects === 0 && ffSnap?.peerMedia?.[chromeId]?.connectionState === 'connected',
    { socketReconnects: ffSnap?.socketReconnects, mesh: ffSnap?.peerMedia?.[chromeId]?.connectionState });
  await chrome.page.click('#next-load');
  let ffUrl = '';
  const followed = await passes(waitForCondition(async () => {
    ffUrl = (await bidi.send('browsingContext.getTree', { root: ctx })).contexts[0].url;
    return ffUrl.includes(EPISODE(2)) && (await ffGj('ping').catch(() => null)) === 'pong';
  }, { timeout: 20_000, label: 'Firefox follows the leader' }));
  ffSnap = await ffGj('getSnapshot').catch(() => null);
  check('Leader changes episode: Firefox follows, same socket, call up', followed && ffSnap?.room?.contentId === EPISODE(2) && ffSnap?.socketReconnects === 0 && ffSnap?.peerMedia?.[chromeId]?.connectionState === 'connected',
    { url: ffUrl, socketReconnects: ffSnap?.socketReconnects, mesh: ffSnap?.peerMedia?.[chromeId]?.connectionState });
  const after = await hears(async () => (await ffGj('getRemoteAudio'))?.[chromeId], CHROME_TONE_HZ);
  check('After the episode change, Firefox still hears Chrome', after.ok, after.last);
  bidi.close();
} catch (e) {
  check('smoke run', false, String(e));
} finally {
  firefox?.kill();
  if (chrome) await closePeers([chrome]);
  playerServer?.close();
  for (const p of owned) p.kill();
  fs.rmSync(profile, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok).length;
  if (failed && firefoxOutput) {
    const log = path.join(import.meta.dirname, '..', 'test-results', 'firefox-smoke.log');
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.writeFileSync(log, firefoxOutput);
    console.log(`Firefox's own output: ${path.relative(process.cwd(), log)}`);
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
