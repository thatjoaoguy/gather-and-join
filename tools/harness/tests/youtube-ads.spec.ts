/**
 * Does one viewer's ad break leave the room alone?
 *
 * YouTube plays ads through the very same <video> as the content, so unlike an
 * HBO-shaped break (reattach.spec.ts) nothing is recreated and nothing looks
 * like a transition: the only signal is a class on the player. Read naively,
 * the ad's own play and seek-to-zero are indistinguishable from the viewer
 * pressing play at the top of the episode, and they would be broadcast — one
 * person's pre-roll would take the whole room into it.
 *
 * So the adapter reports no media at all while the marker is up. What that has
 * to buy, and what this spec measures, is that the room's timeline is untouched
 * for the length of the break, and that the peer who was away catches back up.
 */
import { test, expect } from '@playwright/test';
import { startParty, spreadMs, pressPlay, state, counters, dumpParty } from '../src/party.ts';
import { waitForCondition } from '../src/peers.ts';

/** The fixture's break, plus room for the content source to come back. */
const AD_MS = 6000;

test('same-element ad break: the room advances by wall-clock alone, and the ad peer catches up', async () => {
  const party = await startParty({ n: 2, shape: 'youtube' });
  try {
    const follower = party.peers[1]!;
    await pressPlay(party.leader);
    await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
    await waitForCondition(async () => (await spreadMs(party.peers)).spread < 150, { timeout: 10_000, label: 'initial convergence' });

    const leaderBefore = await state(party.leader);
    const seeksBefore = (await counters(party.leader)).hardSeeks;

    await follower.page.click('#ad');
    // No media reported: the element is still there and still playing, but it is
    // playing an ad, so as far as the room is concerned this peer has no player.
    await waitForCondition(async () => (await state(follower)).positionMs === null, { timeout: 3000, label: 'ad gate closed' });

    await waitForCondition(async () => (await state(follower)).positionMs !== null, { timeout: AD_MS + 10_000, interval: 250, label: 'ad over, element back' });

    // The leader moved exactly as far as time did. Without the gate it would have
    // been seeked to the ad's position instead — a jump of tens of seconds.
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
