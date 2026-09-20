/**
 * Does the postMessage substrate hold sync?
 *
 * Google Drive plays video in a cross-origin iframe, so there is no element to
 * read: position arrives as a pushed `infoDelivery` sample about every 266ms
 * (measured on the real embed) and every command is a message. This spec runs
 * the same measurement as sync-accuracy.spec.ts against that substrate, so the
 * two numbers are directly comparable and the architecture question ("is
 * ~266ms telemetry good enough, or must we inject into the iframe?") gets
 * answered with a spread rather than an estimate.
 *
 * Thresholds match the <video> spec deliberately. If the postMessage path
 * cannot meet them, that is the finding.
 */
import { test, expect } from '@playwright/test';
import { startParty, spreadMs, percentile, pressPlay, state, dumpParty } from '../src/party.ts';
import { waitForCondition, sleepMs } from '../src/peers.ts';

test('drive-shaped sync accuracy: N=3, 60s, p95 pairwise spread < 400ms, max < 1000ms', async () => {
  const party = await startParty({ n: 3, shape: 'drive' });
  try {
    await pressPlay(party.leader);
    await waitForCondition(async () => (await Promise.all(party.peers.map((p) => state(p)))).every((s) => s.paused === false), { label: 'everyone playing' });
    await waitForCondition(async () => (await spreadMs(party.peers)).spread < 400, { timeout: 15_000, label: 'initial convergence' });

    const samples: number[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      const { spread, positions } = await spreadMs(party.peers);
      samples.push(spread);
      test.info().annotations.push({ type: 'sample', description: `${((Date.now() - t0) / 1000).toFixed(1)}s spread=${spread.toFixed(0)} pos=${positions.map((p) => p.toFixed(0)).join(',')}` });
      await sleepMs(2000);
    }
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const max = Math.max(...samples);
    console.log(`drive sync accuracy: n=${samples.length} p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms max=${max.toFixed(0)}ms`);
    expect(samples.length).toBeGreaterThanOrEqual(25);
    expect(p95).toBeLessThan(400);
    expect(max).toBeLessThan(1000);
  } catch (e) {
    await dumpParty(party, 'drive sync accuracy failure');
    throw e;
  } finally {
    await party.close();
  }
});
