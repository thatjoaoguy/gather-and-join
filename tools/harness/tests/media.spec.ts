import { test, expect } from '@playwright/test';
import { startParty, waitForMesh, dumpParty, pressPlay } from '../src/party.ts';
import { waitForCondition, sleepMs } from '../src/peers.ts';
import { PEER_TONES_HZ, PEER_COLORS, colorMatches } from '../src/fixtures.ts';

type Audio = Record<string, { peakHz: number; level: number }>;
type Video = Record<string, { rgb: [number, number, number] | null; framesDecoded: number }>;
type Stats = Record<string, { connectionState: string; signalingState: string; bytesReceived: number; framesDecoded: number; audioPacketsReceived: number }>;

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** Every peer hears every other peer's distinct tone (the fixture tone is on 2s of every 8s). */
async function waitForAudioFrom(peers: Array<{ gj: any; peerId: string; index: number }>, timeout = 20_000) {
  for (const p of peers) {
    for (const q of peers) {
      if (p === q) continue;
      await waitForCondition(async () => {
        const a = await p.gj('getRemoteAudio') as Audio;
        return !!a[q.peerId] && near(a[q.peerId]!.peakHz, PEER_TONES_HZ[q.index]!, 25) && a[q.peerId]!.level > -60;
      }, { timeout, label: `${p.peerId} hears ${q.peerId}'s ${PEER_TONES_HZ[q.index]}Hz tone` });
    }
  }
}

test('mesh audio: each peer receives the right peer\'s tone; ice/signaling stable', async () => {
  const party = await startParty({ n: 3, code: 'MESH01' });
  try {
    await waitForMesh(party.peers);
    await waitForAudioFrom(party.peers);
    for (const p of party.peers) {
      const st = await p.gj('getPeerStats') as Stats;
      for (const q of party.peers) if (q !== p) {
        expect(st[q.peerId]!.connectionState).toBe('connected');
        expect(st[q.peerId]!.signalingState).toBe('stable');
        expect(st[q.peerId]!.audioPacketsReceived).toBeGreaterThan(0);
      }
    }
  } catch (e) { await dumpParty(party, 'mesh audio failure'); throw e; } finally { await party.close(); }
});

test('camera: opt-in video arrives with the right colour and framesDecoded increases', async () => {
  const party = await startParty({ n: 2, code: 'MESH02' });
  try {
    const [a, b] = party.peers as [typeof party.leader, typeof party.leader];
    await waitForMesh(party.peers);
    await a.gj('setCamera', true);
    await waitForCondition(async () => { const v = await b.gj('getRemoteVideo') as Video; return colorMatches(v[a.peerId]?.rgb ?? null, PEER_COLORS[0]!); }, { timeout: 15_000, label: 'peer2 sees peer1 colour' });
    const f1 = ((await b.gj('getRemoteVideo')) as Video)[a.peerId]!.framesDecoded;
    await sleepMs(1000);
    const f2 = ((await b.gj('getRemoteVideo')) as Video)[a.peerId]!.framesDecoded;
    expect(f2).toBeGreaterThan(f1);
    // The page-side tile (loopback) renders too — on the receiver, and as a mirrored "You" self-view on the sender.
    await waitForCondition(() => b.page.evaluate(() => { const host = document.getElementById('gj-tiles'); const v = host?.shadowRoot?.querySelector<HTMLVideoElement>('.tile.has-video:not(.self) video'); return !!v && v.videoWidth > 0; }), { timeout: 10_000, label: 'tile rendered in page sidebar' });
    await waitForCondition(() => a.page.evaluate(() => { const host = document.getElementById('gj-tiles'); const t = host?.shadowRoot?.querySelector('.tile.self.has-video'); const v = t?.querySelector('video'); return !!v && v.videoWidth > 0 && t?.querySelector('.name')?.textContent === 'peer1'; }), { timeout: 10_000, label: 'self-view tile on sender' });
    // The receiver's own tile is a name placeholder (its camera is off); the sidebar pushed the page over.
    expect(await b.page.evaluate(() => !document.getElementById('gj-tiles')?.shadowRoot?.querySelector('.tile.self')?.classList.contains('has-video'))).toBe(true);
    expect(await b.page.evaluate(() => Math.round(document.documentElement.getBoundingClientRect().width) === innerWidth - 240)).toBe(true);
    await b.page.screenshot({ path: 'test-results/sidebar-receiver.png' });
    await a.page.screenshot({ path: 'test-results/sidebar-sender.png' });
    // Camera off: video leaves both sides (tiles stay as name placeholders), connection still fine.
    await a.gj('setCamera', false);
    await waitForCondition(() => b.page.evaluate(() => { const host = document.getElementById('gj-tiles'); return !host?.shadowRoot?.querySelector('.tile.has-video'); }), { timeout: 10_000, label: 'video removed on receiver' });
    await waitForCondition(() => a.page.evaluate(() => { const host = document.getElementById('gj-tiles'); return !host?.shadowRoot?.querySelector('.tile.has-video'); }), { timeout: 10_000, label: 'self-view video removed' });
    await waitForMesh(party.peers);
  } catch (e) { await dumpParty(party, 'camera failure'); throw e; } finally { await party.close(); }
});

test('self-view alone: a lone peer with the camera on sees its own tile', async () => {
  const party = await startParty({ n: 1, code: 'SEFV01', withObserver: false });
  try {
    const a = party.leader;
    await a.gj('setCamera', true);
    await waitForCondition(() => a.page.evaluate(() => { const t = document.getElementById('gj-tiles')?.shadowRoot?.querySelector('.tile.self.has-video'); const v = t?.querySelector('video'); return !!v && v.videoWidth > 0; }), { timeout: 10_000, label: 'self-view without any peers' });
    await a.gj('setCamera', false);
    await waitForCondition(() => a.page.evaluate(() => !document.getElementById('gj-tiles')?.shadowRoot?.querySelector('.tile.has-video')), { timeout: 10_000, label: 'self-view video removed' });
    // Leaving the room removes the sidebar and restores the page width.
    await a.gj('leaveRoom');
    await waitForCondition(() => a.page.evaluate(() => !document.getElementById('gj-tiles') && Math.round(document.documentElement.getBoundingClientRect().width) === innerWidth), { timeout: 10_000, label: 'sidebar removed, page restored' });
  } catch (e) { await dumpParty(party, 'self-view failure'); throw e; } finally { await party.close(); }
});

test('fullscreen: the sidebar re-parents into the fullscreen element and comes back out', async () => {
  // Note: Playwright's page.click hangs across a fullscreen transition; the button is clicked in-page.
  const party = await startParty({ n: 2, code: 'FSCR01' });
  try {
    const [a, b] = party.peers as [typeof party.leader, typeof party.leader];
    await waitForMesh(party.peers);
    await a.gj('setCamera', true);
    await waitForCondition(() => b.page.evaluate(() => !!document.getElementById('gj-tiles')?.shadowRoot?.querySelector('.tile.has-video')), { timeout: 10_000, label: 'peer2 sees a video tile' });
    console.log('fs: clicking');
    await b.page.evaluate(() => (document.getElementById('fullscreen') as HTMLButtonElement).click());
    console.log('fs: clicked');
    await waitForCondition(() => b.page.evaluate(() => {
      const host = document.getElementById('gj-tiles');
      const fs = document.fullscreenElement;
      if (!host || !fs || !fs.contains(host)) return false;
      const r = host.getBoundingClientRect();
      return host.classList.contains('overlay') && r.width === 240 && Math.round(r.right) === innerWidth && r.height > 100;
    }), { timeout: 5000, label: 'sidebar inside fullscreen element, at the right edge' });
    // Tiles are still rendered (not covered) in fullscreen: the video element in the tile is visible.
    expect(await b.page.evaluate(() => { const v = document.getElementById('gj-tiles')!.shadowRoot!.querySelector<HTMLVideoElement>('.tile.has-video video')!; const r = v.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el?.id === 'gj-tiles'; })).toBe(true);
    // The fullscreen element's other children are narrowed so the sidebar covers nothing.
    const widths = await b.page.evaluate(() => ({ inner: innerWidth, kids: Array.from(document.fullscreenElement!.children).map((c) => `${c.tagName}#${c.id} w=${Math.round(c.getBoundingClientRect().width)} shrunk=${(c as HTMLElement).dataset.gjShrunk ?? '-'}`) }));
    console.log('fs widths', JSON.stringify(widths));
    // Every visible sibling of the sidebar is narrowed to leave room for it (zero-width placeholders don't matter).
    const visibleKids = widths.kids.filter((k) => !k.includes('gj-tiles') && !k.includes('w=0 '));
    expect(visibleKids.length).toBeGreaterThan(0);
    expect(visibleKids.every((k) => k.includes(`w=${widths.inner - 240} `))).toBe(true);
    console.log('fs: in fullscreen, sidebar ok');
    await b.page.screenshot({ path: 'test-results/sidebar-fullscreen.png' });
    console.log('fs: screenshot taken');
    await b.page.evaluate(() => document.exitFullscreen());
    await waitForCondition(() => b.page.evaluate(() => { const host = document.getElementById('gj-tiles'); return !document.fullscreenElement && host?.parentElement === document.body && !host.classList.contains('overlay') && Math.round(document.documentElement.getBoundingClientRect().width) === innerWidth - 240 && !document.querySelector('#player [data-gj-shrunk]') && document.querySelector('video')!.style.width === '100%' && Math.round(document.querySelector('video')!.getBoundingClientRect().width) === Math.round(document.getElementById('player')!.getBoundingClientRect().width); }), { timeout: 5000, label: 'sidebar back in body, page shrunk again, video width restored exactly' });
  } catch (e) { await dumpParty(party, 'fullscreen failure'); throw e; } finally { await party.close(); }
});

test('perfect negotiation: 20 simultaneous camera toggles with jitter end connected and stable', async () => {
  const party = await startParty({ n: 2, code: 'MESH03' });
  try {
    const [a, b] = party.peers as [typeof party.leader, typeof party.leader];
    await waitForMesh(party.peers);
    const jitter = () => 50 + Math.floor(Math.random() * 150);
    const toggler = async (p: typeof a) => { for (let i = 0; i < 20; i++) { await p.gj('setCamera', i % 2 === 0); await sleepMs(jitter()); } };
    await Promise.all([toggler(a), toggler(b)]);
    await waitForCondition(async () => {
      for (const p of party.peers) {
        const st = await p.gj('getPeerStats') as Stats;
        for (const q of party.peers) if (q !== p && (st[q.peerId]?.connectionState !== 'connected' || st[q.peerId]?.signalingState !== 'stable')) return false;
      }
      return true;
    }, { timeout: 20_000, label: 'all connections connected + stable after toggle storm' });
    // Audio still flows both ways afterwards.
    await waitForAudioFrom(party.peers);
  } catch (e) { await dumpParty(party, 'negotiation failure'); throw e; } finally { await party.close(); }
});

test('ducking: tone onset ducks the video within 300ms; offset restores within 1.5s', async () => {
  const party = await startParty({ n: 2, code: 'DKNG01' });
  try {
    const a = party.leader;
    await pressPlay(a);
    // Fixture envelope: 3s silence, 2s tone, 3s silence. Wait for a silent period, then catch the onset.
    await waitForCondition(async () => (await a.gj('getVolume') as number) > 0.95, { timeout: 10_000, label: 'silence baseline' });
    await waitForCondition(async () => (await a.gj('getDiag') as any).localMicLevel < 0.005, { timeout: 10_000, label: 'mic silent' });
    // Onset: poll fast; from the moment the mic level rises, volume must be < 0.35 within 300ms.
    let onsetAt = 0;
    await waitForCondition(async () => { const d = await a.gj('getDiag') as any; if (d.localMicLevel > 0.02) { onsetAt = Date.now(); return true; } return false; }, { timeout: 10_000, interval: 20, label: 'tone onset' });
    await waitForCondition(async () => (await a.gj('getVolume') as number) < 0.35, { timeout: 300 + 100, interval: 10, label: 'ducked within 300ms' });
    const duckLatency = Date.now() - onsetAt;
    // Offset: the tone lasts 2s; once the mic falls silent, restoration must complete within 1.5s (after the 1s silence hold).
    await waitForCondition(async () => (await a.gj('getDiag') as any).localMicLevel < 0.005, { timeout: 5000, interval: 20, label: 'tone offset' });
    const offsetAt = Date.now();
    await waitForCondition(async () => (await a.gj('getVolume') as number) > 0.95, { timeout: 1500 + 100, interval: 10, label: 'restored within 1.5s' });
    console.log(`ducking: down in ${duckLatency}ms, up in ${Date.now() - offsetAt}ms`);
    expect(duckLatency).toBeLessThanOrEqual(400);
  } catch (e) { await dumpParty(party, 'ducking failure'); throw e; } finally { await party.close(); }
});
