import { test, expect } from '@playwright/test';
import { startParty, spreadMs, pressPlay, state, snapshot, dumpParty } from '../src/party.ts';
import { waitForCondition } from '../src/peers.ts';
import { EXTRAS_SECONDS } from '../src/player-server.ts';

/**
 * Two copies of one episode: the guest's has EXTRAS_SECONDS in front of it. The host
 * holds the shorter copy and aligns the guest's from its own sidebar, which is the case
 * where the peer who notices is not the one whose copy moves.
 */
const EXTRAS_MS = EXTRAS_SECONDS * 1000;
/** Same frame, within what the drift corrector already holds between two identical copies. */
const SAME_FRAME_MS = 250;

test.describe('episode start', () => {
  test('episode start: the longer copy skips its extras and plays the same frame', async () => {
    const party = await startParty({ n: 2, copies: ['plain', 'extras'] });
    try {
      const host = party.peers[0]!, guest = party.peers[1]!;

      // Both copies are measured, and the host's sidebar proposes the difference.
      await waitForCondition(async () => (await snapshot(host))?.peers.filter((p) => p.copy).length === 2, { label: 'both copies measured' });
      const proposal = host.page.locator('#gj-tiles').locator('.rail-notice.copies input');
      await expect(proposal).toHaveValue('1:00');
      await host.page.locator('#gj-tiles').locator('.rail-notice.copies button.align').click();
      await waitForCondition(async () => (await snapshot(guest))?.room?.episodeStart?.startMs === EXTRAS_MS, { label: 'guest has the episode start' });
      await expect(host.page.locator('#gj-tiles').locator('.rail-notice.copies')).toBeHidden(); // asked and answered: adjusting lives in settings now

      // A paused room at 0: the longer copy is already past its extras.
      await waitForCondition(async () => Math.abs((await state(guest)).positionMs! - EXTRAS_MS) < SAME_FRAME_MS, { timeout: 5000, label: 'guest at the episode\'s first frame' });

      await pressPlay(host);
      await waitForCondition(async () => (await state(guest)).paused === false, { label: 'guest playing' });
      await waitForCondition(async () => (await spreadMs(party.peers, [0, EXTRAS_MS])).spread < SAME_FRAME_MS, { timeout: 10_000, label: 'same frame in both copies' });
      const { positions } = await spreadMs(party.peers);
      console.log(`copies ${Math.round(positions[1]! - positions[0]!)}ms apart on their own timelines (extras ${EXTRAS_MS}ms)`);
      expect(Math.abs(positions[1]! - positions[0]! - EXTRAS_MS)).toBeLessThan(SAME_FRAME_MS);

      // Scrubbing back into the extras is a seek to the episode's first frame, for everyone: never before it.
      await guest.page.evaluate(() => { (window as any).__fakePlayer.video().currentTime = 10; });
      await waitForCondition(async () => (await spreadMs(party.peers, [0, EXTRAS_MS])).spread < SAME_FRAME_MS, { timeout: 5000, label: 'guest back in the episode' });
      expect(party.observer.ofType('playback').every((f) => f.msg.positionMs >= 0)).toBe(true);

      // Reopened from the gear, a typed value moves the longer copy at once, to the hundredth.
      const rail = host.page.locator('#gj-tiles');
      await rail.locator('.gear').click();
      const field = rail.locator('.settings .copies input');
      await expect(field).toHaveValue('1:00');
      await field.fill('1:01.25');
      await field.press('Enter');
      await waitForCondition(async () => (await snapshot(guest))?.room?.episodeStart?.startMs === EXTRAS_MS + 1250, { label: 'typed start reached the room' });
      await waitForCondition(async () => (await spreadMs(party.peers, [0, EXTRAS_MS + 1250])).spread < SAME_FRAME_MS, { timeout: 2000, label: 'guest 1.25s further in' });
    } catch (e) { await dumpParty(party, 'episode start failure'); throw e; } finally { await party.close(); }
  });
});

test.describe('settings panel', () => {
  test('settings panel: the gear opens room settings; mic toggles in it and on your own tile reach the room', async () => {
    const party = await startParty({ n: 2 });
    try {
      const a = party.peers[0]!, b = party.peers[1]!;
      const rail = a.page.locator('#gj-tiles');
      const panel = rail.locator('.settings');
      await expect(panel).toBeHidden();
      await rail.locator('.gear').click();
      await expect(panel).toBeVisible();
      await expect(panel.locator('.code')).toHaveText(party.code);
      await expect(panel.locator('.episode .service')).toHaveText('Fake player');
      await expect(panel.locator('.episode .title')).toContainText('G0000001');
      await expect(panel.locator('.episode .copies')).toBeHidden(); // same copies: nothing to skip, nothing shown
      await panel.locator('.mic').click();
      await waitForCondition(async () => (await snapshot(b))?.peerMedia[a.peerId]?.micOn === false, { label: 'the other peer sees the mute' });
      await expect(panel.locator('.mic')).toHaveAttribute('aria-pressed', 'false');
      await a.page.keyboard.press('Escape');
      await expect(panel).toBeHidden();

      // Your own tile has the same toggle, on hover.
      const own = rail.locator('.tile.self');
      const controls = own.locator('.self-controls');
      const mic = controls.locator('.mic');
      await a.page.mouse.move(10, 10); // off the rail: the panel's Mic button sat right over the tile
      await expect(controls).toHaveCSS('opacity', '0');
      await own.hover();
      await expect(controls).toHaveCSS('opacity', '1');
      await expect(mic).toHaveAttribute('aria-pressed', 'false');
      await mic.click();
      await waitForCondition(async () => (await snapshot(b))?.peerMedia[a.peerId]?.micOn === true, { label: 'the other peer hears you again' });
      await expect(mic).toHaveAttribute('aria-pressed', 'true');
    } catch (e) { await dumpParty(party, 'settings panel failure'); throw e; } finally { await party.close(); }
  });
});
