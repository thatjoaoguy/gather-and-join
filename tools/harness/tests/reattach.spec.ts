import { test, expect } from '@playwright/test';
import { startParty, spreadMs, pressPlay, state, counters, dumpParty } from '../src/party.ts';
import { waitForCondition } from '../src/peers.ts';

test('element re-attach: recreate <video> mid-playback → rewired, spread recovers, no socket reconnect', async () => {
  const party = await startParty({ n: 2, code: 'RATT01' });
  try {
    const follower = party.peers[1]!;
    await pressPlay(party.leader);
    await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
    await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });
    const before = await counters(follower);
    const genBefore = (await state(follower)).generation;

    await follower.page.click('#recreate');
    await waitForCondition(async () => (await state(follower)).generation !== genBefore, { timeout: 2000, label: 'element recreated' });
    await waitForCondition(async () => (await counters(follower)).reattaches > before.reattaches, { timeout: 2000, label: 'reattach counted' });
    await waitForCondition(async () => { const s = await state(follower); return s.paused === false && (await spreadMs(party.peers)).spread < 400; }, { timeout: 3000, label: 'spread recovered' });

    // Events must flow from the new element: a local pause on the follower reaches the room.
    const t0 = Date.now();
    await follower.page.click('#pause');
    await waitForCondition(async () => (await state(party.leader)).paused === true, { timeout: 3000, label: 'pause from new element propagated' });
    expect(party.observer.ofType('playback').some((f) => f.t >= t0 && f.msg.originPeerId === follower.peerId && f.msg.paused)).toBe(true);
    const after = await counters(follower);
    expect(after.socketReconnects).toBe(0);
  } catch (e) { await dumpParty(party, 'reattach failure'); throw e; } finally { await party.close(); }
});

test('quality switch and ad break: element swaps do not desync or reconnect', async () => {
  const party = await startParty({ n: 2, code: 'RATT02' });
  try {
    const follower = party.peers[1]!;
    await pressPlay(party.leader);
    await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
    await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });
    const before = await counters(follower);
    await follower.page.click('#quality');
    await waitForCondition(async () => (await counters(follower)).reattaches > before.reattaches, { timeout: 3000, label: 'quality switch rewired' });
    await waitForCondition(async () => (await state(follower)).paused === false && (await spreadMs(party.peers)).spread < 400, { timeout: 5000, label: 'spread recovered after quality switch' });
    expect((await counters(follower)).socketReconnects).toBe(0);

    // Ad break on the follower: a different 15s source is swapped in, then the main source returns.
    // Mid-break positions are not comparable (§6.5); what must hold is recovery afterwards.
    // Past 20s so the 15s ad clip's end cannot coincide with the room position (the §6.5 guard compares the two).
    await waitForCondition(async () => (await state(follower)).positionMs! > 20_000, { timeout: 25_000, interval: 500, label: 'past 20s' });
    const mid = await counters(follower);
    await follower.page.click('#ad-break');
    await waitForCondition(async () => (await counters(follower)).reattaches > mid.reattaches, { timeout: 3000, label: 'ad element wired' });
    await waitForCondition(() => follower.page.evaluate(() => !document.getElementById('player')!.dataset.adBreak), { timeout: 20_000, interval: 250, label: 'ad break over' });
    await waitForCondition(async () => (await state(follower)).paused === false && (await spreadMs(party.peers)).spread < 400, { timeout: 5000, label: 'spread recovered after ad break' });
    expect((await counters(follower)).socketReconnects).toBe(0);
  } catch (e) { await dumpParty(party, 'quality failure'); throw e; } finally { await party.close(); }
});
