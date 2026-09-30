/**
 * Does a player that is only ever a frame join the room?
 *
 * Wix Video is a widget in an `embed.wix.com` iframe on a site of any domain,
 * so the extension matches the frame and never the page around it. The
 * Wix-shaped page reproduces that: the fake player framed by a site on
 * wixsite.localhost, which the extension does not match. Everything the room
 * knows (content, watch URL, position) must then come from the frame, and the
 * site's own layout must be left alone.
 */
import { test, expect } from '@playwright/test';
import { startParty, spreadMs, pressPlay, state, snapshot, dumpParty } from '../src/party.ts';
import { EPISODE, waitForCondition, type Peer } from '../src/peers.ts';

/** The player ends where the sidebar begins, and fills the rest of the frame. */
const fitsBesideSidebar = (p: Peer, label: string) => waitForCondition(() => p.player().evaluate(() => {
  const player = document.getElementById('player')!.getBoundingClientRect(), tiles = document.getElementById('gj-tiles')!.getBoundingClientRect();
  return Math.abs(player.right - tiles.left) <= 1 && Math.abs(player.width - (innerWidth - tiles.width)) <= 1;
}), { timeout: 5000, label });

test('wix-shaped embed: the room follows a player framed by an unmatched site, both ways, fullscreen included', async () => {
  const party = await startParty({ n: 2, shape: 'wix' });
  const [leader, guest] = [party.peers[0]!, party.peers[1]!];
  try {
    // The room's episode and way back to it are the frame's, not the site's.
    const room = (await snapshot(leader))!.room!;
    expect(room.contentId).toBe(EPISODE(1));
    expect(room.watchUrl).toContain('/wixembed/');

    // The sidebar is in the frame, and the player beside it rather than under it, although it
    // sized itself to the window in inline pixels with a min-width; the site's page is untouched.
    for (const p of party.peers) {
      await waitForCondition(() => p.player().evaluate(() => !!document.getElementById('gj-tiles')), { timeout: 10_000, label: `${p.name} sidebar in the frame` });
      await fitsBesideSidebar(p, `${p.name} player fits beside the sidebar`);
      expect(await p.page.evaluate(() => ({ tiles: !!document.getElementById('gj-tiles'), narrowed: Math.round(document.documentElement.getBoundingClientRect().width) !== innerWidth })))
        .toEqual({ tiles: false, narrowed: false });
    }

    await pressPlay(leader);
    await waitForCondition(async () => (await Promise.all(party.peers.map((p) => state(p)))).every((s) => s.paused === false), { label: 'everyone playing' });
    await waitForCondition(async () => (await spreadMs(party.peers)).spread < 400, { timeout: 15_000, label: 'initial convergence' });

    // The other direction: a seek in the guest's frame moves the room, and the leader with it.
    await guest.player().click('#seek-fwd');
    await waitForCondition(async () => {
      const { spread, positions } = await spreadMs(party.peers);
      return spread < 400 && positions.every((ms) => ms > 55_000);
    }, { timeout: 15_000, label: 'leader follows the guest\'s seek' });

    // Fullscreen is taken inside the frame (the site sees only its iframe go fullscreen): the
    // sidebar must move into the frame's fullscreen element, stay on top, and come back out.
    const frame = guest.player();
    await frame.click('#fullscreen');
    await waitForCondition(() => frame.evaluate(() => {
      const fs = document.fullscreenElement, host = document.getElementById('gj-tiles'), r = host?.getBoundingClientRect();
      return !!fs && !!host && fs.contains(host) && !!r?.width && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id === 'gj-tiles';
    }), { timeout: 5000, label: 'sidebar on top in the frame\'s fullscreen element' });
    expect(await guest.page.evaluate(() => document.fullscreenElement?.tagName)).toBe('IFRAME');
    await frame.evaluate(() => document.exitFullscreen());
    await waitForCondition(() => frame.evaluate(() => !document.fullscreenElement && document.getElementById('gj-tiles')?.parentElement === document.body), { timeout: 5000, label: 'sidebar back in the frame\'s body' });
    // Leaving fullscreen, the player sizes itself to the window again, over the sidebar's widths.
    await fitsBesideSidebar(guest, 'player fits beside the sidebar again after fullscreen');
  } catch (e) {
    await dumpParty(party, 'wix embed failure');
    throw e;
  } finally {
    await party.close();
  }
});
