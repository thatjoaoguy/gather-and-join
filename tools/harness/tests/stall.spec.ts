import { test, expect } from '@playwright/test';
import { startParty, spreadMs, pressPlay, state, dumpParty } from '../src/party.ts';
import { waitForCondition, type Peer, type PlayerShape } from '../src/peers.ts';
import { STARVE_AT_SECONDS } from '../src/player-server.ts';

/**
 * The guest's copy runs dry at STARVE_AT_SECONDS and buffers there for good. The room
 * must pause where the guest stopped. The room's last anchor is a heartbeat up to 5s
 * old, and pausing there rewinds everyone, the guest included, out of the buffer it
 * was waiting on.
 *
 * Once per shape: each service reaches buffering differently — a real element's
 * `waiting`, the Disney facade forwarding its visible element's, the Drive embed's
 * BUFFERING state over postMessage — and each has to come out as the same stall.
 */
const STARVE_AT_MS = STARVE_AT_SECONDS * 1000;
/** How far short of the last byte a player stops: the decoder's look-ahead, not the room's. */
const STOP_SHORT_MS = 500;
/** Paused peers agree to within the dead zone; past it the paused room seeks them. */
const SAME_SPOT_MS = 250;
/** Long enough for any resume to have reached the observer. Nobody presses play here. */
const HOLD_MS = 2000;
const SHAPES: PlayerShape[] = ['hbo', 'youtube', 'drive', 'wix', 'disney'];
/**
 * In sync before the stall, by each shape's own measure. The Drive embed reports its
 * position every ~266ms, and two Drive players inside the drift dead zone stay put, so
 * drive-sync.spec.ts settles for 400ms; anything tighter fails for no reason of ours.
 */
const IN_SYNC_MS: Partial<Record<PlayerShape, number>> = { drive: 400 };

/**
 * Where a player is, from the page rather than the extension where they differ: on the
 * Disney shape the program clock is the page's own (`__dp.exactMs`), since a facade that
 * is wrong the same way on every peer would agree with itself.
 */
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
      // A facade attaches a moment after the hook is up (Disney: once the page has a trusted offset).
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

      // Where the guest ran dry, not the last heartbeat before it.
      expect(stall.msg.positionMs).toBeGreaterThan(STARVE_AT_MS - STOP_SHORT_MS);
      expect(stall.msg.positionMs).toBeLessThanOrEqual(STARVE_AT_MS);
      // Nobody rewound: both sit on the stall position.
      expect(Math.abs(h.ms! - stall.msg.positionMs)).toBeLessThan(SAME_SPOT_MS);
      expect(Math.abs(g.ms! - stall.msg.positionMs)).toBeLessThan(SAME_SPOT_MS);
      // Manual resume only: no play frame from anyone since.
      const resumed = party.observer.frames.slice(stallAt + 1).filter((f) => f.msg.type === 'playback' && !f.msg.paused);
      expect(resumed).toHaveLength(0);
      expect(h.paused && g.paused).toBe(true);
    } catch (e) { await dumpParty(party, `stall failure (${shape})`); throw e; } finally { await party.close(); }
  });

});
