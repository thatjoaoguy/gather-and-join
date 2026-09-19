import { test, expect } from '@playwright/test';
import { RATE_NUDGE_SCALE_MS } from '@gj/shared';
import { startParty, spreadMs, pressPlay, state, counters, dumpParty } from '../src/party.ts';
import { waitForCondition } from '../src/peers.ts';

/**
 * The corrector closes drift at rate |drift|/RATE_NUDGE_SCALE_MS, so drift decays with
 * that time constant: 800ms → 150ms takes scale·ln(800/150) ≈ 6.7s. Budget twice that,
 * so the test fails when correction is broken rather than when the machine is busy.
 */
const SMALL_DRIFT_MS = 800;
const CONVERGED_MS = 150;
const EXPECTED_CONVERGE_MS = RATE_NUDGE_SCALE_MS * Math.log(SMALL_DRIFT_MS / CONVERGED_MS);
const CONVERGE_BUDGET_MS = Math.ceil(2 * EXPECTED_CONVERGE_MS);

test.describe('drift correction', () => {
  test('small drift: forceDrift(800) converges <150ms with zero hard seeks', async () => {
    const party = await startParty({ n: 2 });
    try {
      const follower = party.peers[1]!;
      await pressPlay(party.leader);
      await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });
      const before = await counters(follower);

      await follower.gj('forceDrift', SMALL_DRIFT_MS);
      await waitForCondition(async () => (await spreadMs(party.peers)).spread > 600, { timeout: 2000, label: 'drift injected' });
      const t0 = Date.now();
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < CONVERGED_MS, { timeout: CONVERGE_BUDGET_MS, label: `converged under ${CONVERGED_MS}ms` });
      const convergedMs = Date.now() - t0;
      console.log(`small drift converged in ${convergedMs}ms (expected ~${Math.round(EXPECTED_CONVERGE_MS)}ms, budget ${CONVERGE_BUDGET_MS}ms)`);

      const after = await counters(follower);
      expect(after.hardSeeks - before.hardSeeks).toBe(0);
      expect(after.rateAdjustments - before.rateAdjustments).toBeGreaterThanOrEqual(1);
      // Rate must be restored once inside the exit band.
      await waitForCondition(async () => (await state(follower)).playbackRate === 1, { timeout: 3000, label: 'rate restored' });
    } catch (e) { await dumpParty(party, 'small drift failure'); throw e; } finally { await party.close(); }
  });

  test('large drift: forceDrift(4000) → exactly one hard seek, converges within 2s', async () => {
    const party = await startParty({ n: 2 });
    try {
      const follower = party.peers[1]!;
      await pressPlay(party.leader);
      await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
      await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });
      const before = await counters(follower);

      await follower.gj('forceDrift', 4000);
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
    const party = await startParty({ n: 2 });
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
