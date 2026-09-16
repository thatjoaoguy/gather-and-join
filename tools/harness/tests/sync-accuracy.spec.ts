import { test, expect } from '@playwright/test';
import { startParty, spreadMs, percentile, pressPlay, state, dumpParty } from '../src/party.ts';
import { waitForCondition, sleepMs } from '../src/peers.ts';

test('sync accuracy: N=3, 60s, p95 pairwise spread < 400ms, max < 1000ms', async () => {
  const party = await startParty({ n: 3, code: 'SYNC01' });
  try {
    await pressPlay(party.leader);
    await waitForCondition(async () => (await Promise.all(party.peers.map((p) => state(p)))).every((s) => s.paused === false), { label: 'everyone playing' });
    // Let late joiners settle into the room position before sampling.
    await waitForCondition(async () => (await spreadMs(party.peers)).spread < 400, { timeout: 10_000, label: 'initial convergence' });

    const samples: number[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      const { spread, positions } = await spreadMs(party.peers);
      samples.push(spread);
      test.info().annotations.push({ type: 'sample', description: `${((Date.now() - t0) / 1000).toFixed(1)}s spread=${spread.toFixed(0)} pos=${positions.map((p) => p.toFixed(0)).join(',')}` });
      await sleepMs(2000);
    }
    party.observer.writeJsonl('observer-logs/sync-accuracy.jsonl');
    const p95 = percentile(samples, 95);
    const max = Math.max(...samples);
    console.log(`sync accuracy: n=${samples.length} p95=${p95.toFixed(0)}ms max=${max.toFixed(0)}ms`);
    expect(samples.length).toBeGreaterThanOrEqual(25);
    expect(p95).toBeLessThan(400);
    expect(max).toBeLessThan(1000);
  } catch (e) {
    await dumpParty(party, 'sync accuracy failure');
    throw e;
  } finally {
    await party.close();
  }
});
