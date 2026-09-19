import { test, expect } from '@playwright/test';
import { startParty, spreadMs, pressPlay, state, snapshot, dumpParty } from '../src/party.ts';
import { launchPeer, openPlayer, waitForCondition } from '../src/peers.ts';

test('late join: joining 45s into playback lands within 500ms of the room within 5s', async () => {
  const party = await startParty({ n: 2 });
  try {
    await pressPlay(party.leader);
    // Real-time playback: 45s cannot arrive sooner, so the budget is 45s plus room for a
    // stall, not a measure of anything the test is asserting.
    await waitForCondition(async () => (await state(party.leader)).positionMs! > 45_000, { timeout: 90_000, interval: 500, label: '45s of playback' });

    const late = await launchPeer(2);
    party.peers.push(late);
    await openPlayer(late);
    await late.gj('joinRoom', party.code, late.name);
    const t0 = Date.now();
    await waitForCondition(async () => (await snapshot(late))?.room?.code === party.code, { label: 'late peer in room' });
    await waitForCondition(async () => { const s = await state(late); return s.paused === false && (await spreadMs([party.leader, late])).spread < 500; }, { timeout: 5000, label: 'late joiner within 500ms' });
    console.log(`late join converged in ${Date.now() - t0}ms`);
    expect((await state(late)).positionMs!).toBeGreaterThan(45_000);
  } catch (e) { await dumpParty(party, 'late join failure'); throw e; } finally { await party.close(); }
});
