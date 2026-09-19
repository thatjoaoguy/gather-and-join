import { test, expect } from '@playwright/test';
import { REMOTE_AUDIO_SAMPLE_MS } from '@gj/shared';
import { startParty, snapshot, state, counters, waitForMesh, dumpParty } from '../src/party.ts';
import { waitForCondition, waitForHook, sleepMs, EPISODE, watchUrl, type Peer } from '../src/peers.ts';

type Diag = { socketReconnects: number; remoteAudio: Record<string, { level: number; maxGapMs: number; lastAudibleAt: number }>; peerStats: Record<string, { connectionState: string }> };

/** Read the offscreen document's mirrored diagnostics via the (persistent) extension page — independent of the player tab's lifetime. */
const mirroredDiag = (p: Peer) => p.extPage.evaluate(() => chrome.storage.session.get('gjDiag').then((v: Record<string, unknown>) => v.gjDiag)) as Promise<Diag>;

test('navigation survival: socket, mesh and remote audio survive pushState, real load and leader navigate', async () => {
  // Continuous tones so any audible gap is a real drop, not the fixture envelope.
  const party = await startParty({ n: 3, continuousTone: true });
  try {
    const [leader, f1] = party.peers as [Peer, Peer, Peer];
    await waitForMesh(party.peers);
    // Everyone audibly hears everyone before we start counting gaps.
    for (const p of party.peers) {
      await waitForCondition(async () => { const d = await mirroredDiag(p); return party.peers.filter((q) => q !== p).every((q) => (d?.remoteAudio?.[q.peerId]?.level ?? -Infinity) > -60); }, { timeout: 20_000, label: `${p.name} hears all peers` });
    }
    for (const p of party.peers) await p.gj('resetAudioGaps');
    const before = await Promise.all(party.peers.map(counters));

    // Sample connection state throughout, from outside the pages.
    let connectedThroughout = true;
    let stop = false;
    const watcher = (async () => {
      while (!stop) {
        for (const p of party.peers) {
          const d = await mirroredDiag(p).catch(() => null);
          if (d) for (const [id, st] of Object.entries(d.peerStats)) if (!id.startsWith('obs:') && st.connectionState !== 'connected') { connectedThroughout = false; console.log(`${p.name}: ${id} ${st.connectionState}`); }
        }
        await sleepMs(100);
      }
    })();

    // 1. Client-side route on a follower.
    await f1.page.click('#next-push');
    await waitForCondition(async () => (await state(f1)).contentId === EPISODE(2), { label: 'f1 pushState' });
    // 2. Real page load on the same follower.
    await f1.page.goto(watchUrl(EPISODE(1)));
    await waitForHook(f1);
    await waitForCondition(async () => (await snapshot(f1))?.room?.code === party.code, { label: 'f1 still in room after reload' });
    // 3. Leader navigates the room; everyone follows via real loads.
    await leader.page.click('#next-load');
    for (const p of party.peers) { await p.page.waitForURL(`**/watch/${EPISODE(2)}`, { timeout: 15_000 }); await waitForHook(p); }
    await waitForCondition(async () => (await Promise.all(party.peers.map(snapshot))).every((s) => s?.room?.contentId === EPISODE(2)), { label: 'room content updated' });
    await waitForMesh(party.peers);
    await sleepMs(2000);
    stop = true;
    await watcher;

    const after = await Promise.all(party.peers.map(counters));
    for (let i = 0; i < party.peers.length; i++) expect(after[i]!.socketReconnects, `${party.peers[i]!.name} socket reconnects`).toBe(before[i]!.socketReconnects);
    for (const p of party.peers) expect((await counters(p)).socketReconnects).toBe(0);
    expect(connectedThroughout, 'every pc stayed connected throughout').toBe(true);
    for (const p of party.peers) {
      const d = await mirroredDiag(p);
      for (const q of party.peers) if (q !== p) {
        const a = d.remoteAudio[q.peerId]!;
        // The sampler runs every REMOTE_AUDIO_SAMPLE_MS, so a few missed timer callbacks on a
        // busy machine look like a gap. Allow that; a real dropout is far longer.
        expect(a.maxGapMs, `${p.name} hearing ${q.name}: longest audio gap`).toBeLessThanOrEqual(8 * REMOTE_AUDIO_SAMPLE_MS);
        expect(Date.now() - a.lastAudibleAt, `${p.name} still hears ${q.name}`).toBeLessThan(1000);
      }
    }
  } catch (e) { await dumpParty(party, 'navigation failure'); throw e; } finally { await party.close(); }
});
