import { test, expect } from '@playwright/test';
import { startParty, snapshot, state, dumpParty } from '../src/party.ts';
import { waitForCondition, waitForHook, EPISODE } from '../src/peers.ts';

test('leader authority: non-leader navigate is rejected with an error frame; leader navigate makes everyone follow', async () => {
  const party = await startParty({ n: 3, code: 'ATHR01' });
  try {
    const [leader, f1, f2] = party.peers as [typeof party.leader, typeof party.leader, typeof party.leader];

    // Non-leader: explicit error, nobody moves.
    const errP = party.observer.next((r) => r.msg.type === 'navigate', 3000).then(() => 'navigated', () => 'no-navigate');
    await f1.gaj('navigate', EPISODE(2));
    await waitForCondition(async () => (await snapshot(f1))?.room !== null && (await f1.gaj<any>('getSnapshot')).lastError?.code === 'NOT_LEADER', { timeout: 5000, label: 'NOT_LEADER error surfaced' });
    expect(await errP).toBe('no-navigate');
    for (const p of party.peers) expect((await state(p)).contentId).toBe(EPISODE(1));

    // Leader: everyone lands on the new content and the room state follows.
    const navP = party.observer.next((r) => r.msg.type === 'navigate' && r.msg.contentId === EPISODE(2));
    await leader.page.click('#next-push');
    const nav = await navP;
    expect(nav.msg.type === 'navigate' && nav.msg.originPeerId).toBe('peer1');
    for (const p of [f1, f2]) {
      await p.page.waitForURL(`**/watch/${EPISODE(2)}`, { timeout: 10_000 });
      await waitForHook(p);
    }
    await waitForCondition(async () => (await Promise.all(party.peers.map(snapshot))).every((s) => s?.room?.contentId === EPISODE(2)), { label: 'room content updated everywhere' });
    for (const p of party.peers) expect((await state(p)).contentId).toBe(EPISODE(2));
  } catch (e) { await dumpParty(party, 'authority failure'); throw e; } finally { await party.close(); }
});

test('a tab off the room\'s episode cannot drive the room', async () => {
  const party = await startParty({ n: 2, code: 'ATHR03' });
  try {
    const follower = party.peers[1]!;
    await follower.page.click('#next-push'); // follower wanders to E2; room stays on E1
    await waitForCondition(async () => (await state(follower)).contentId === EPISODE(2), { label: 'follower on E2' });
    const t0 = Date.now();
    await follower.page.click('#play');
    await follower.page.click('#seek-fwd');
    await waitForCondition(() => Date.now() - t0 > 1500, { timeout: 3000, label: 'settle' });
    expect(party.observer.ofType('playback').filter((f) => f.t >= t0 && f.msg.originPeerId === follower.peerId)).toHaveLength(0);
    expect((await state(party.leader)).paused).toBe(true);
  } catch (e) { await dumpParty(party, 'off-episode failure'); throw e; } finally { await party.close(); }
});

test('autoplay-next: non-leaders suppress the countdown; only the leader transition propagates', async () => {
  const party = await startParty({ n: 2, code: 'ATHR02' });
  try {
    const follower = party.peers[1]!;
    await follower.page.click('#show-up-next');
    // The follower's countdown is dismissed (its "Cancel autoplay" clicked) and the panel hidden; no navigation happens.
    await waitForCondition(async () => follower.page.evaluate(() => { const el = document.querySelector<HTMLElement>('[data-testid="up_next"]'); const t = el?.querySelector('[data-testid="player-ux-up-next-timer"]'); return !!el && getComputedStyle(el).display === 'none' && t?.textContent === '—'; }), { timeout: 3000, label: 'countdown dismissed + hidden on follower' });
    await waitForCondition(() => new Promise<boolean>((r) => setTimeout(() => r(true), 12_000)), { timeout: 15_000, label: 'countdown window elapsed' });
    expect((await state(follower)).contentId).toBe(EPISODE(1));
    expect(party.observer.ofType('navigate').filter((f) => f.msg.contentId !== EPISODE(1))).toHaveLength(0);
  } catch (e) { await dumpParty(party, 'autoplay failure'); throw e; } finally { await party.close(); }
});
