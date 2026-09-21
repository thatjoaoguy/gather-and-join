/**
 * Test-level composition: N extension-bearing Chromes in one room on the fake
 * player, plus the headless observer recording ground truth.
 */
import { test } from '@playwright/test';
import { generateRoomCode, isValidRoomCode } from '@gj/shared';
import { Observer } from './observer.ts';
import { launchPeer, openPlayer, closePeers, waitForCondition, EPISODE, SERVER_URL, type Peer, type Sabotage, type PlayerShape } from './peers.ts';

export type Party = {
  peers: Peer[];
  leader: Peer;
  observer: Observer;
  code: string;
  close(): Promise<void>;
};

export type PartyOptions = { n: number; /** Defaults to a fresh code: the server holds a room for ROOM_TTL_MS after the last peer leaves, so a re-run must not reuse one. */ code?: string; sabotage?: Sabotage; headless?: boolean; contentId?: string; withObserver?: boolean; continuousTone?: boolean; shape?: PlayerShape };

export async function startParty({ n, code = generateRoomCode(), sabotage, headless, contentId = EPISODE(1), withObserver = true, continuousTone = false, shape = 'hbo' }: PartyOptions): Promise<Party> {
  if (!isValidRoomCode(code)) throw new Error(`test room code ${code} is not Crockford base32 (no I, L, O, U)`);
  const peers: Peer[] = [];
  for (let i = 0; i < n; i++) peers.push(await launchPeer(i, { sabotage, headless, continuousTone }));
  for (const p of peers) await openPlayer(p, contentId, shape);

  const leader = peers[0]!;
  await leader.gj('createRoom', code, leader.name);
  await waitForCondition(async () => inRoom(await snapshot(leader), code, true), { label: 'leader in room' });
  for (const p of peers.slice(1)) {
    await p.gj('joinRoom', code, p.name);
    await waitForCondition(async () => inRoom(await snapshot(p), code, false), { label: `${p.name} in room` });
  }
  const observer = new Observer(SERVER_URL, 'obs:harness');
  if (withObserver) {
    await observer.connect();
    await observer.join(code, '__observer');
    await observer.syncClock();
  }
  const expectedPeers = n + (withObserver ? 1 : 0);
  for (const p of peers) {
    await waitForCondition(async () => (await snapshot(p))?.peers.length === expectedPeers, { label: `${p.name} sees ${expectedPeers} peers` });
  }
  return {
    peers, leader, observer, code,
    close: async () => { observer.close(); await closePeers(peers); },
  };
}

/** On failure: print every peer's state, counters and the tail of the observer log. */
/** Throws on a server refusal (ROOM_EXISTS, ...) so the reason is the failure, not a timeout. */
function inRoom(snap: Snap | null, code: string, needSocket: boolean): boolean {
  const err = snap?.lastError;
  if (err) throw new Error(`server refused: ${err.code}${err.message ? ` (${err.message})` : ''}`);
  if (snap?.room?.code !== code) return false;
  return !needSocket || snap.socket === 'connected';
}

export async function dumpParty(party: Party, label = 'dump') {
  // A failure the sabotage matrix expects still gets dumped: otherwise a row that failed for
  // the wrong reason (load, ports, a lost room) is indistinguishable from the sabotage biting.
  // The dump is slow against a jammed page, so cap it rather than skip it.
  const expected = process.env.GJ_EXPECT_FAIL;
  const budgetMs = expected && new RegExp(expected).test(test.info().title) ? 5_000 : 30_000;
  const timeout = new Promise<void>((resolve) => setTimeout(() => { console.log(`--- ${label}: dump cut short after ${budgetMs}ms ---`); resolve(); }, budgetMs));
  await Promise.race([dumpPartyInner(party, label), timeout]);
}

async function dumpPartyInner(party: Party, label: string) {
  console.log(`--- ${label} ---`);
  for (const p of party.peers) {
    const [st, c, sn] = await Promise.all([state(p).catch(String), counters(p).catch(String), snapshot(p).catch(String)]);
    const s = sn as Snap | string;
    console.log(p.name, JSON.stringify(st), JSON.stringify(c), typeof s === 'string' ? s : JSON.stringify({ socket: s.socket, room: s.room, isLeader: s.isLeader, peerMedia: s.peerMedia }));
  }
  const tail = party.observer.frames.slice(-40);
  for (const f of tail) console.log('obs', f.t % 100000, JSON.stringify(f.msg));
  for (const p of party.peers) {
    const sess: any = await p.extPage.evaluate(() => chrome.storage.session.get(null)).catch(() => ({}));
    for (const k of Object.keys(sess).filter((k) => k.startsWith('gjLog'))) console.log(`${p.name} ${k}\n  ` + sess[k].slice(-120).join('\n  '));
  }
}

export type Snap = {
  socket: string; socketReconnects: number; room: { code: string; contentId: string | null; paused: boolean; positionMs: number; leaderId: string } | null;
  peers: Array<{ peerId: string; name: string }>; yourPeerId: string; isLeader: boolean; camOn: boolean; micOn: boolean;
  peerMedia: Record<string, { connectionState: string; iceConnectionState: string; signalingState: string; hasAudio: boolean; hasVideo: boolean }>;
  lastError: { code: string; message: string } | null;
};
export const snapshot = (p: Peer) => p.gj<Snap | null>('getSnapshot');

/**
 * What the toolbar icon is showing. Read from the peer's extension page, which is
 * an extension context and so can call chrome.action, unlike a player page. There
 * is no getter for the icon itself, so `text` only proves the absence of a badge.
 */
export type Badge = { text: string; title: string };
export const badge = (p: Peer): Promise<Badge> =>
  p.extPage.evaluate(async () => ({ text: await chrome.action.getBadgeText({}), title: await chrome.action.getTitle({}) }));

export type State = { positionMs: number | null; paused: boolean | null; contentId: string | null; atUnixMs: number; playbackRate: number | null; generation: string | null };
export const state = (p: Peer) => p.gj<State>('getState');
export type Counters = { hardSeeks: number; rateAdjustments: number; reattaches: number; socketReconnects: number; portReconnects: number };
export const counters = (p: Peer) => p.gj<Counters>('getCounters');

/** Wait until every mesh connection on every peer is `connected`. */
export async function waitForMesh(peers: Peer[], timeout = 30_000) {
  await waitForCondition(async () => {
    for (const p of peers) {
      const s = await snapshot(p);
      if (!s) return false;
      const others = s.peers.filter((q) => q.peerId !== s.yourPeerId && !q.peerId.startsWith('obs:'));
      if (others.length !== peers.length - 1) return false;
      for (const o of others) if (s.peerMedia[o.peerId]?.connectionState !== 'connected') return false;
    }
    return true;
  }, { timeout, label: 'full mesh connected' });
}

/** Press the fake player's Play button on a peer's page. */
export async function pressPlay(p: Peer) { await p.page.click('#play'); }
export async function pressPause(p: Peer) { await p.page.click('#pause'); }

/**
 * Pairwise spread of positions across peers, normalised to one clock: a
 * playing peer sampled at t is extrapolated to the common instant T.
 */
export async function spreadMs(peers: Peer[]): Promise<{ spread: number; positions: number[] }> {
  const states = await Promise.all(peers.map((p) => state(p)));
  const T = Math.max(...states.map((s) => s.atUnixMs));
  const positions = states.map((s) => {
    if (s.positionMs === null) return NaN;
    return s.paused ? s.positionMs : s.positionMs + (T - s.atUnixMs) * (s.playbackRate ?? 1);
  });
  if (positions.some(Number.isNaN)) return { spread: Infinity, positions };
  return { spread: Math.max(...positions) - Math.min(...positions), positions };
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}
