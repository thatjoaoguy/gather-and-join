/**
 * Does one viewer's ad break leave the room alone?
 *
 * YouTube plays ads through the same <video> as the content, so unlike an
 * HBO-shaped break (reattach.spec.ts) nothing is recreated and the only signal is
 * a class on the player. Taken at face value, the ad's play and seek-to-zero are
 * a viewer starting the episode over, and reach everyone as that.
 *
 * The adapter reports no media for the break instead. What that has to buy is
 * measured here: the room's timeline untouched for its length, and the peer who
 * was away back in step afterwards.
 */
import { test, expect } from '@playwright/test';
import { startParty, spreadMs, pressPlay, state, counters, dumpParty } from '../src/party.ts';
import { waitForCondition, sleepMs } from '../src/peers.ts';

/** The fixture's break, plus room for the content source to come back. */
const AD_MS = 6000;

test('same-element ad break: the room advances by wall-clock alone, and the ad peer catches up', async () => {
  const party = await startParty({ n: 2, shape: 'youtube' });
  try {
    const follower = party.peers[1]!;
    await pressPlay(party.leader);
    await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
    await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });
    // Far enough in that the position the player restores to is unmistakably content,
    // not something a freshly emptied element could report by accident.
    await waitForCondition(async () => (await state(follower)).positionMs! > 3000, { timeout: 15_000, interval: 250, label: 'past 3s' });

    const leaderBefore = await state(party.leader);
    const seeksBefore = (await counters(party.leader)).hardSeeks;

    await follower.page.click('#ad');
    // No media reported: the element is still there and still playing, but it is
    // playing an ad, so as far as the room is concerned this peer has no player.
    await waitForCondition(async () => (await state(follower)).positionMs === null, { timeout: 3000, label: 'ad gate closed' });

    // Content back, not merely the marker gone: the marker clears while the element is empty.
    await waitForCondition(async () => { const s = await state(follower); return s.positionMs !== null && s.positionMs > 1000; },
      { timeout: AD_MS + 15_000, interval: 250, label: 'ad over, content back' });
    // The restore seek lands a beat after the element does, past the echo window.
    await sleepMs(2500);

    // As far as time did, and no further: ungated, the leader is seeked into the
    // ad's timeline or back to where the ad peer resumed.
    const leaderAfter = await state(party.leader);
    const advanced = leaderAfter.positionMs! - leaderBefore.positionMs!;
    const elapsed = leaderAfter.atUnixMs - leaderBefore.atUnixMs;
    console.log(`leader advanced ${advanced.toFixed(0)}ms over ${elapsed}ms of wall clock`);
    expect(Math.abs(advanced - elapsed)).toBeLessThan(500);
    expect((await counters(party.leader)).hardSeeks).toBe(seeksBefore);

    // And the peer who was away rejoins the room's position rather than staying
    // a break behind it.
    await waitForCondition(async () => (await state(follower)).paused === false && (await spreadMs(party.peers)).spread < 400, { timeout: 10_000, label: 'ad peer caught up' });
    expect((await counters(follower)).socketReconnects).toBe(0);
  } catch (e) { await dumpParty(party, 'youtube ad break failure'); throw e; } finally { await party.close(); }
});
