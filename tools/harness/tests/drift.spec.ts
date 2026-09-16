import { test, expect } from '@playwright/test';
import { startParty, spreadMs, pressPlay, state, counters, dumpParty } from '../src/party.ts';
import { waitForCondition } from '../src/peers.ts';

test.describe('drift correction', () => {
  test('small drift: forceDrift(800) converges <150ms within 8s with zero hard seeks', async () => {
    const party = await startParty({ n: 2, code: 'DRFT01' });
    try {
      const follower = party.peers[1]!;
      await pressPlay(party.leader);
      await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });
      const before = await counters(follower);

      await follower.gaj('forceDrift', 800);
      await waitForCondition(async () => (await spreadMs(party.peers)).spread > 600, { timeout: 2000, label: 'drift injected' });
      const t0 = Date.now();
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 8000, label: 'converged under 150ms' });
      console.log(`small drift converged in ${Date.now() - t0}ms`);

      const after = await counters(follower);
      expect(after.hardSeeks - before.hardSeeks).toBe(0);
      expect(after.rateAdjustments - before.rateAdjustments).toBeGreaterThanOrEqual(1);
      // Rate must be restored once inside the exit band.
      await waitForCondition(async () => (await state(follower)).playbackRate === 1, { timeout: 3000, label: 'rate restored' });
    } catch (e) { await dumpParty(party, 'small drift failure'); throw e; } finally { await party.close(); }
  });

  test('large drift: forceDrift(4000) → exactly one hard seek, converges within 2s', async () => {
    const party = await startParty({ n: 2, code: 'DRFT02' });
    try {
      const follower = party.peers[1]!;
      await pressPlay(party.leader);
      await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });
      const before = await counters(follower);

      await follower.gaj('forceDrift', 4000);
      const t0 = Date.now();
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < 250, { timeout: 2000, label: 'converged after hard seek' });
      console.log(`large drift converged in ${Date.now() - t0}ms`);
      const after = await counters(follower);
      expect(after.hardSeeks - before.hardSeeks).toBe(1);
      // No echo: the follower's corrective seek must not have been broadcast as a room seek.
      const echoed = party.observer.ofType('playback').filter((f) => f.msg.originPeerId === follower.peerId && f.t >= t0);
      expect(echoed).toHaveLength(0);
    } catch (e) { await dumpParty(party, 'large drift failure'); throw e; } finally { await party.close(); }
  });

  test('echo suppression: a remote seek applied locally is not rebroadcast', async () => {
    const party = await startParty({ n: 2, code: 'ECH001' });
    try {
      const follower = party.peers[1]!;
      await pressPlay(party.leader);
      await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });
      const t0 = Date.now();
      await party.leader.page.click('#seek-fwd');
      await waitForCondition(async () => (await state(follower)).positionMs! > 50_000, { timeout: 5000, label: 'follower followed the seek' });
      // Hold long enough for any echo to arrive.
      await waitForCondition(() => Date.now() - t0 > 1500, { timeout: 3000, label: 'settle' });
      const fromFollower = party.observer.ofType('playback').filter((f) => f.msg.originPeerId === follower.peerId && f.t >= t0);
      const fromLeader = party.observer.ofType('playback').filter((f) => f.msg.originPeerId === party.leader.peerId && f.t >= t0);
      expect(fromLeader.length).toBeGreaterThanOrEqual(1);
      expect(fromFollower).toHaveLength(0);
    } catch (e) { await dumpParty(party, 'echo failure'); throw e; } finally { await party.close(); }
  });
});
