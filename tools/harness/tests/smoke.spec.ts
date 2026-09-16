import { test, expect } from '@playwright/test';
import { startParty, snapshot, state, pressPlay } from '../src/party.ts';
import { waitForCondition } from '../src/peers.ts';

test('two peers join a room, play propagates, observer sees frames', async () => {
  const party = await startParty({ n: 2, code: 'SM0K01' });
  try {
    const [a, b] = party.peers;
    expect((await snapshot(a!))!.isLeader).toBe(true);
    expect((await snapshot(b!))!.isLeader).toBe(false);
    expect((await snapshot(a!))!.room!.contentId).toBe('urn:hbo:episode:G0000001');

    await pressPlay(a!);
    await waitForCondition(async () => (await state(b!)).paused === false, { label: 'follower playing' });
    const pb = party.observer.ofType('playback');
    expect(pb.length).toBeGreaterThan(0);
    expect(pb[0]!.msg.originPeerId).toBe('peer1');
    expect(pb[0]!.msg.paused).toBe(false);
    party.observer.writeJsonl('observer-logs/smoke.jsonl');
  } finally {
    await party.close();
  }
});
