import { test, expect } from '@playwright/test';
import { startParty, snapshot, state, counters, waitForMesh, dumpParty, pressPlay, spreadMs } from '../src/party.ts';
import { waitForCondition, waitForHook, EPISODE, type Peer } from '../src/peers.ts';

/**
 * §11: terminate the extension service worker through CDP instead of waiting
 * out the 30s idle timer. Verified against the bundled Chromium: the worker's
 * CDP target is `service_worker`; `Target.closeTarget` on it kills the worker,
 * and Chrome restarts it on the next event (a webNavigation event here).
 */
async function killServiceWorker(p: Peer): Promise<string | null> {
  const cdp = await p.context.newCDPSession(p.extPage);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(p.extensionId));
  if (!sw) return null;
  await cdp.send('Target.closeTarget', { targetId: sw.targetId });
  await cdp.detach();
  return sw.targetId;
}
async function serviceWorkerTargetId(p: Peer): Promise<string | null> {
  const cdp = await p.context.newCDPSession(p.extPage);
  const { targetInfos } = await cdp.send('Target.getTargets');
  await cdp.detach();
  return targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(p.extensionId))?.targetId ?? null;
}

test('service worker termination: the room, mesh and sync survive; navigation still relays after restart', async () => {
  const party = await startParty({ n: 2, code: 'SWK001' });
  try {
    const [leader, follower] = party.peers as [Peer, Peer];
    await waitForMesh(party.peers);
    await pressPlay(leader);
    await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });
    const before = await counters(follower);

    // The worker must actually have died: the offscreen document's storage writes wake it again within
    // milliseconds, so "absent at some instant" is a race; a worker with a *new* target id proves the kill.
    // Chrome occasionally ignores Target.closeTarget on a worker; insist until it takes.
    let killed: string | null = null;
    let replaced = false;
    for (let attempt = 0; attempt < 4 && !replaced; attempt++) {
      killed = await killServiceWorker(follower);
      expect(killed).not.toBeNull();
      replaced = await waitForCondition(async () => { const id = await serviceWorkerTargetId(follower); return id === null || id !== killed; }, { timeout: 2000, label: 'service worker replaced by a new instance' }).then(() => true, () => false);
    }
    expect(replaced, 'service worker replaced by a new instance').toBe(true);

    // Nothing that matters lived there: socket, room and playback untouched.
    await waitForCondition(async () => (await spreadMs(party.peers)).spread < 400, { timeout: 5000, label: 'still in sync' });
    expect((await snapshot(follower))!.room!.code).toBe(party.code);
    expect((await counters(follower)).socketReconnects).toBe(before.socketReconnects);

    // The worker restarts on demand: a leader navigation is detected and relayed, the follower follows.
    await leader.page.click('#next-push');
    await follower.page.waitForURL(`**/watch/${EPISODE(2)}`, { timeout: 15_000 });
    await waitForHook(follower);
    await waitForCondition(async () => (await snapshot(follower))?.room?.contentId === EPISODE(2), { label: 'room content updated after SW restart' });
    expect((await counters(follower)).socketReconnects).toBe(0);
  } catch (e) { await dumpParty(party, 'service worker failure'); throw e; } finally { await party.close(); }
});
