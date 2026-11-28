import { test, expect } from '@playwright/test';
import { startParty, snapshot, state, pressPlay, badge, logLines } from '../src/party.ts';
import { HEARTBEAT_MS } from '@gj/shared';
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

    // Each frame is applied once, though it reaches the page twice: as itself and in the
    // snapshot after it. The play and the first heartbeat; the log is written on a debounce
    // through the worker, so wait for it to catch up, then give a doubled copy time to land.
    await waitForCondition(() => party.observer.ofType('playback').length >= 2, { timeout: HEARTBEAT_MS + 3000, label: 'a heartbeat after the play' });
    const frames = party.observer.ofType('playback');
    expect(frames.every((f) => f.msg.type === 'playback' && !f.msg.paused)).toBe(true);
    const applied = async () => (await logLines(b!)).filter((l) => /\[sync@\w+\] apply play /.test(l));
    await waitForCondition(async () => (await applied()).length >= frames.length, { timeout: 5000, label: 'every frame in the guest\'s log' });
    const settledFrom = Date.now();
    await waitForCondition(() => Date.now() - settledFrom >= 1500, { timeout: 2500, label: 'time for a second copy to land' });
    // Heartbeats are 5s apart, so nothing new arrives in that time; a doubled log would read 2 per frame.
    const lines = await applied();
    expect(lines.length, lines.join('\n')).toBeLessThanOrEqual(party.observer.ofType('playback').length);
    party.observer.writeJsonl(test.info().outputPath('smoke.jsonl'));
  } finally {
    await party.close();
  }
});
