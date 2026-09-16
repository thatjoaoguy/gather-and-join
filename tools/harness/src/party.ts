/**
 * Test-level composition: N extension-bearing Chromes in one room on the fake
 * player, plus the headless observer recording ground truth.
 */
import { test } from '@playwright/test';
import { isValidRoomCode } from '@gaj/shared';
import { Observer } from './observer.ts';
import { launchPeer, openPlayer, closePeers, waitForCondition, EPISODE, SERVER_URL, type Peer, type Sabotage } from './peers.ts';

export type Party = {
  peers: Peer[];
  leader: Peer;
  observer: Observer;
  code: string;
  close(): Promise<void>;
};

export type PartyOptions = { n: number; code: string; sabotage?: Sabotage; headless?: boolean; contentId?: string; withObserver?: boolean; continuousTone?: boolean };

export async function startParty({ n, code, sabotage, headless, contentId = EPISODE(1), withObserver = true, continuousTone = false }: PartyOptions): Promise<Party> {
  if (!isValidRoomCode(code)) throw new Error(`test room code ${code} is not Crockford base32 (no I, L, O, U)`);
  const peers: Peer[] = [];
  for (let i = 0; i < n; i++) peers.push(await launchPeer(i, { sabotage, headless, continuousTone }));
  for (const p of peers) await openPlayer(p, contentId);

  const leader = peers[0]!;
  await leader.gaj('createRoom', code, leader.name);
  await waitForCondition(async () => (await snapshot(leader))?.room?.code === code && (await snapshot(leader))?.socket === 'connected', { label: 'leader in room' });
  for (const p of peers.slice(1)) {
    await p.gaj('joinRoom', code, p.name);
    await waitForCondition(async () => (await snapshot(p))?.room?.code === code, { label: `${p.name} in room` });
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
export async function dumpParty(party: Party, label = 'dump') {
  // A failure the sabotage matrix expects is not worth diagnosing, and the dump is slow against a jammed page.
  const expected = process.env.GAJ_EXPECT_FAIL;
  if (expected && new RegExp(expected).test(test.info().title)) { console.log(`--- ${label}: expected under GAJ_SABOTAGE=${process.env.GAJ_SABOTAGE}, dump skipped ---`); return; }
  console.log(`--- ${label} ---`);
  for (const p of party.peers) {
    const [st, c, sn] = await Promise.all([state(p).catch(String), counters(p).catch(String), snapshot(p).catch(String)]);
    const s = sn as Snap | string;
    console.log(p.name, JSON.stringify(st), JSON.stringify(c), typeof s === 'string' ? s : JSON.stringify({ socket: s.socket, room: s.room, isLeader: s.isLeader, peerMedia: s.peerMedia }));
  }
  const tail = party.observer.frames.slice(-15);
  for (const f of tail) console.log('obs', f.t % 100000, JSON.stringify(f.msg));
  for (const p of party.peers) {
    const sess: any = await p.extPage.evaluate(() => chrome.storage.session.get(null)).catch(() => ({}));
    for (const k of Object.keys(sess).filter((k) => k.startsWith('gajLog'))) console.log(`${p.name} ${k}\n  ` + sess[k].slice(-25).join('\n  '));
  }
}

export type Snap = {
  socket: string; socketReconnects: number; room: { code: string; contentId: string | null; paused: boolean; positionMs: number; leaderId: string } | null;
  peers: Array<{ peerId: string; name: string }>; yourPeerId: string; isLeader: boolean; camOn: boolean; micOn: boolean;
  peerMedia: Record<string, { connectionState: string; iceConnectionState: string; signalingState: string; hasAudio: boolean; hasVideo: boolean }>;
};
export const snapshot = (p: Peer) => p.gaj<Snap | null>('getSnapshot');

export type State = { positionMs: number | null; paused: boolean | null; contentId: string | null; atUnixMs: number; playbackRate: number | null; generation: string | null };
export const state = (p: Peer) => p.gaj<State>('getState');
export type Counters = { hardSeeks: number; rateAdjustments: number; reattaches: number; socketReconnects: number; portReconnects: number };
export const counters = (p: Peer) => p.gaj<Counters>('getCounters');

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
