import { test, expect } from '@playwright/test';
import { startParty, snapshot, state, pressPlay, badge } from '../src/party.ts';
import { waitForCondition } from '../src/peers.ts';

test('two peers join a room, play propagates, observer sees frames', async () => {
  const party = await startParty({ n: 2 });
  try {
    const [a, b] = party.peers;
    expect((await snapshot(a!))!.isLeader).toBe(true);
    expect((await snapshot(b!))!.isLeader).toBe(false);
    expect((await snapshot(a!))!.room!.contentId).toBe('urn:hbo:episode:G0000001');

    // The toolbar icon says so too. Only the service worker can paint it, so this
    // also proves the offscreen → worker report. The dot itself is drawn into the
    // icon and has no getter, so the tooltip stands in for it here; the pixels are
    // covered by apps/extension/test/badge.test.ts.
    await waitForCondition(async () => (await badge(a!)).title.includes('Connected'), { label: 'connected tooltip on the leader' });
    expect((await badge(a!)).text, 'no Chrome badge: the dot is part of the icon').toBe('');

    await pressPlay(a!);
    await waitForCondition(async () => (await state(b!)).paused === false, { label: 'follower playing' });
    const pb = party.observer.ofType('playback');
    expect(pb.length).toBeGreaterThan(0);
    expect(pb[0]!.msg.originPeerId).toBe('peer1');
    expect(pb[0]!.msg.paused).toBe(false);
    party.observer.writeJsonl(test.info().outputPath('smoke.jsonl'));
  } finally {
    await party.close();
  }
});
