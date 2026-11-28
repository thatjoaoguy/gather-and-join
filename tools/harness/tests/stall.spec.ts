import { test, expect } from '@playwright/test';
import { startParty, spreadMs, pressPlay, state, dumpParty } from '../src/party.ts';
import { OWN_STALL_HOLD_MS } from '@gj/shared';
import { waitForCondition, PLAYER_ORIGIN, type Peer, type PlayerShape } from '../src/peers.ts';
import { STARVE_AT_SECONDS } from '../src/player-server.ts';

/** The guest's copy runs dry at STARVE_AT_SECONDS. Once per shape: each reaches buffering its own way. */
const STARVE_AT_MS = STARVE_AT_SECONDS * 1000;
/** The decoder stops a little short of the last byte. */
const STOP_SHORT_MS = 500;
const SAME_SPOT_MS = 250;
const HOLD_MS = 2000;
const SHAPES: PlayerShape[] = ['hbo', 'youtube', 'drive', 'wix', 'disney'];
/** Drive reports position every ~266ms; drive-sync.spec.ts settles for 400ms too. */
const IN_SYNC_MS: Partial<Record<PlayerShape, number>> = { drive: 400 };

/** Disney positions come from the page's own clock: a facade wrong on every peer would agree with itself. */
const pill = (viewer: Peer, whose: Peer) => viewer.player().locator(`#gj-tiles .tile[data-peer-id="${whose.peerId}"] .pill.buffering`);
const readyPill = (viewer: Peer, whose: Peer) => viewer.player().locator(`#gj-tiles .tile[data-peer-id="${whose.peerId}"] .pill.ready`);

async function where(p: Peer, shape: PlayerShape): Promise<{ ms: number | null; paused: boolean | null }> {
  if (shape === 'disney') {
    return p.player().evaluate(() => ({ ms: (window as any).__dp.exactMs() as number, paused: (document.getElementById('main') as HTMLVideoElement).paused }));
  }
  const s = await state(p);
  return { ms: s.positionMs, paused: s.paused };
}

test.describe('buffering stall', () => {
  for (const shape of SHAPES) test(`buffering stall (${shape}): the room pauses where the stalled player stopped, and stays paused`, async () => {
    const party = await startParty({ n: 2, shape, copies: ['plain', 'starved'] });
    try {
      const host = party.leader, guest = party.peers[1]!;
      await waitForCondition(async () => (await Promise.all(party.peers.map(state))).every((s) => s.positionMs !== null), { label: 'every player attached' });
      await pressPlay(host);
      await waitForCondition(async () => (await state(guest)).paused === false, { label: 'guest playing' });
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < (IN_SYNC_MS[shape] ?? 150), { timeout: 10_000, label: 'initial convergence' });

      const isStall = (f: (typeof party.observer.frames)[number]) => f.msg.type === 'playback' && f.msg.reason === 'stall';
      await waitForCondition(() => party.observer.frames.some(isStall), { timeout: STARVE_AT_MS + 10_000, label: 'guest reports a stall' });
      const stallAt = party.observer.frames.findIndex(isStall);
      const stall = party.observer.frames[stallAt]!;
      if (stall.msg.type !== 'playback') throw new Error('unreachable');
      expect(stall.msg.originPeerId).toBe(guest.peerId);

      await waitForCondition(async () => (await where(host, shape)).paused === true, { timeout: 3000, label: 'host paused by the stall' });
      await waitForCondition(() => Date.now() - stall.t > HOLD_MS, { timeout: HOLD_MS + 1000, label: 'hold' });
      const [h, g] = await Promise.all([where(host, shape), where(guest, shape)]);
      console.log(`${shape}: stall reported at ${Math.round(stall.msg.positionMs)}ms; host paused at ${Math.round(h.ms!)}ms, guest at ${Math.round(g.ms!)}ms (starved at ${STARVE_AT_MS}ms)`);

      expect(stall.msg.positionMs).toBeGreaterThan(STARVE_AT_MS - STOP_SHORT_MS);
      expect(stall.msg.positionMs).toBeLessThanOrEqual(STARVE_AT_MS);
      expect(Math.abs(h.ms! - stall.msg.positionMs)).toBeLessThan(SAME_SPOT_MS);
      expect(Math.abs(g.ms! - stall.msg.positionMs)).toBeLessThan(SAME_SPOT_MS);
      const resumed = party.observer.frames.slice(stallAt + 1).filter((f) => f.msg.type === 'playback' && !f.msg.paused);
      expect(resumed).toHaveLength(0);
      expect(h.paused && g.paused).toBe(true);

      await expect(pill(host, guest)).toBeVisible();
      await expect(pill(guest, guest)).toBeVisible();
      await expect(pill(host, host)).toBeHidden();
      await expect(pill(guest, host)).toBeHidden();
    } catch (e) { await dumpParty(party, `stall failure (${shape})`); throw e; } finally { await party.close(); }
  });

  test('buffering stall (hbo): a player that resumes itself when data returns does not resume the room', async () => {
    const party = await startParty({ n: 2, copies: ['plain', 'starved'] });
    try {
      const host = party.leader, guest = party.peers[1]!;
      await pressPlay(host);
      await waitForCondition(async () => (await state(guest)).paused === false, { label: 'guest playing' });
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });

      const isStall = (f: (typeof party.observer.frames)[number]) => f.msg.type === 'playback' && f.msg.reason === 'stall';
      // Polled tightly: the data has to come back inside the hold.
      await waitForCondition(() => party.observer.frames.some(isStall), { timeout: STARVE_AT_MS + 10_000, interval: 10, label: 'guest reports a stall' });
      const stallAt = party.observer.frames.findIndex(isStall);
      const stall = party.observer.frames[stallAt]!;
      if (stall.msg.type !== 'playback') throw new Error('unreachable');
      const released = Number(await (await fetch(`${PLAYER_ORIGIN}/media/starved/release`)).text());
      expect(released).toBeGreaterThan(0);

      const selfResumes = () => guest.player().evaluate(() => (window as any).__selfResumes as number[]);
      await waitForCondition(async () => (await selfResumes()).length > 0, { timeout: 3000, label: 'the guest\'s player resumed itself' });
      const resumedAfterMs = (await selfResumes())[0]! - stall.t;
      console.log(`the guest's player resumed itself ${resumedAfterMs}ms after the stall reached the room (hold: ${OWN_STALL_HOLD_MS}ms)`);
      expect(resumedAfterMs).toBeLessThan(OWN_STALL_HOLD_MS);

      await waitForCondition(() => Date.now() - stall.t > HOLD_MS, { timeout: HOLD_MS + 1000, label: 'hold' });
      const [h, g] = await Promise.all([state(host), state(guest)]);
      const resumed = party.observer.frames.slice(stallAt + 1).filter((f) => f.msg.type === 'playback' && !f.msg.paused);
      expect(resumed).toHaveLength(0);
      expect(h.paused && g.paused).toBe(true);
      expect(Math.abs(g.positionMs! - stall.msg.positionMs)).toBeLessThan(SAME_SPOT_MS);

      await expect(readyPill(host, guest)).toBeVisible();
      await pressPlay(host);
      await waitForCondition(async () => (await state(guest)).paused === false, { label: 'guest resumed with the room' });
      for (const p of [pill(host, guest), pill(guest, guest), readyPill(host, guest), readyPill(guest, guest)]) await expect(p).toBeHidden();
    } catch (e) { await dumpParty(party, 'self-resume failure'); throw e; } finally { await party.close(); }
  });

  for (const shape of SHAPES) test(`buffering stall (${shape}): once the stalled player has caught up, everyone sees it is ready, and nothing resumes`, async () => {
    const party = await startParty({ n: 2, shape, copies: ['plain', 'starved'] });
    try {
      const host = party.leader, guest = party.peers[1]!;
      await waitForCondition(async () => (await Promise.all(party.peers.map(state))).every((s) => s.positionMs !== null), { label: 'every player attached' });
      await pressPlay(host);
      await waitForCondition(async () => (await state(guest)).paused === false, { label: 'guest playing' });
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < (IN_SYNC_MS[shape] ?? 150), { timeout: 10_000, label: 'initial convergence' });

      const isStall = (f: (typeof party.observer.frames)[number]) => f.msg.type === 'playback' && f.msg.reason === 'stall';
      await waitForCondition(() => party.observer.frames.some(isStall), { timeout: STARVE_AT_MS + 10_000, label: 'guest reports a stall' });
      const stallAt = party.observer.frames.findIndex(isStall);
      await expect(pill(host, guest)).toBeVisible();
      await expect(readyPill(host, guest)).toBeHidden(); // nothing loaded past the cut yet

      const releasedAt = Date.now();
      expect(Number(await (await fetch(`${PLAYER_ORIGIN}/media/starved/release`)).text())).toBeGreaterThan(0);
      const readyFrame = () => party.observer.frames.find((f) => f.msg.type === 'bufferReady' && f.msg.from === guest.peerId && f.msg.ready);
      await waitForCondition(() => !!readyFrame(), { timeout: 10_000, label: 'the guest says it can go on' });
      console.log(`${shape}: ready ${readyFrame()!.t - releasedAt}ms after the data came back`);
      await expect(readyPill(host, guest)).toBeVisible();
      await expect(readyPill(guest, guest)).toBeVisible();
      await expect(pill(host, guest)).toBeHidden();

      await waitForCondition(() => Date.now() - releasedAt > HOLD_MS, { timeout: HOLD_MS + 1000, label: 'hold' });
      const resumed = party.observer.frames.slice(stallAt + 1).filter((f) => f.msg.type === 'playback' && !f.msg.paused);
      expect(resumed).toHaveLength(0);
      const [h, g] = await Promise.all([where(host, shape), where(guest, shape)]);
      expect(h.paused && g.paused).toBe(true);

      await pressPlay(host);
      await waitForCondition(async () => (await where(guest, shape)).paused === false, { label: 'guest resumed with the room' });
      await expect(readyPill(host, guest)).toBeHidden();
      await expect(readyPill(guest, guest)).toBeHidden();
    } catch (e) { await dumpParty(party, `ready failure (${shape})`); throw e; } finally { await party.close(); }
  });
});
