/**
 * Does the sidebar survive a hostile page, and make room on one?
 *
 * The HBO-shaped fixture is a cooperative page — no CSS reset, player in the
 * flow — so narrowing <html> is enough there and neither half of this is
 * exercised. Here:
 *
 *  - a document rule matching the shadow host beats :host, so a reset listing
 *    `div` reaches the sidebar's own background;
 *  - an app layer laid out against the viewport ignores a narrowed <html>, in
 *    fullscreen too, where the only child to narrow is <body>.
 */
import { test, expect } from '@playwright/test';
import { startParty, dumpParty } from '../src/party.ts';
import { waitForCondition } from '../src/peers.ts';

const SIDEBAR = 240;

test('youtube-shaped page: the sidebar keeps its own styling and pushes the app layer aside', async () => {
  const party = await startParty({ n: 2, shape: 'youtube', withObserver: false });
  try {
    const peer = party.leader;
    await waitForCondition(() => peer.page.evaluate(() => !!document.getElementById('gj-tiles')), { timeout: 10_000, label: 'sidebar mounted' });

    // The page's reset must not have reached through to the host.
    const host = await peer.page.evaluate(() => {
      const h = document.getElementById('gj-tiles')!;
      const c = getComputedStyle(h);
      return { background: c.backgroundColor, position: c.position, width: c.width, font: c.fontFamily };
    });
    expect(host.background).toBe('rgb(16, 14, 21)');
    expect(host.position).toBe('fixed');
    expect(host.width).toBe(`${SIDEBAR}px`);
    expect(host.font).toContain('Quicksand');

    // And the viewport-anchored layer must have been narrowed, not just <html>.
    await waitForCondition(() => peer.page.evaluate((w) => {
      const layer = document.getElementById('app-layer')!;
      return Math.round(layer.getBoundingClientRect().right) <= innerWidth - w;
    }, SIDEBAR), { timeout: 5000, label: 'app layer narrowed in page mode' });
    const pageMode = await peer.page.evaluate(() => ({
      inner: innerWidth,
      layer: Math.round(document.getElementById('app-layer')!.getBoundingClientRect().width),
      player: Math.round(document.getElementById('movie_player')!.getBoundingClientRect().right),
    }));
    console.log('page mode', JSON.stringify(pageMode));
    expect(pageMode.layer).toBe(pageMode.inner - SIDEBAR);
    expect(pageMode.player).toBeLessThanOrEqual(pageMode.inner - SIDEBAR);

    // Fullscreen is taken on <html>; the layer still has to move over.
    await peer.page.evaluate(() => (document.getElementById('fullscreen') as HTMLButtonElement).click());
    await waitForCondition(() => peer.page.evaluate(() => document.fullscreenElement === document.documentElement), { timeout: 5000, label: 'fullscreen on <html>' });
    await waitForCondition(() => peer.page.evaluate((w) => {
      const layer = document.getElementById('app-layer')!;
      return Math.round(layer.getBoundingClientRect().right) <= innerWidth - w;
    }, SIDEBAR), { timeout: 5000, label: 'app layer narrowed in fullscreen' });
    const fsMode = await peer.page.evaluate(() => ({
      inner: innerWidth,
      layer: Math.round(document.getElementById('app-layer')!.getBoundingClientRect().width),
      hostRight: Math.round(document.getElementById('gj-tiles')!.getBoundingClientRect().right),
    }));
    console.log('fullscreen', JSON.stringify(fsMode));
    expect(fsMode.layer).toBe(fsMode.inner - SIDEBAR);
    expect(fsMode.hostRight).toBe(fsMode.inner);

    // Coming back out puts every width back exactly as it was.
    await peer.page.evaluate(() => document.exitFullscreen());
    await waitForCondition(() => peer.page.evaluate((w) => {
      const layer = document.getElementById('app-layer')!;
      return !document.fullscreenElement && Math.round(layer.getBoundingClientRect().width) === innerWidth - w;
    }, SIDEBAR), { timeout: 5000, label: 'back to page mode, layer still narrowed' });

    await peer.gj('leaveRoom');
    await waitForCondition(() => peer.page.evaluate(() => !document.getElementById('gj-tiles')
      && !document.querySelector('[data-gj-shrunk]')
      && document.getElementById('app-layer')!.style.getPropertyValue('width') === ''), { timeout: 10_000, label: 'sidebar gone, every width restored' });
  } catch (e) { await dumpParty(party, 'youtube layout failure'); throw e; } finally { await party.close(); }
});
