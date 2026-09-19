import { test, expect } from '@playwright/test';
import { startParty, snapshot, state, counters, waitForMesh, pressPlay, spreadMs, dumpParty } from '../src/party.ts';
import { waitForCondition, type Peer } from '../src/peers.ts';

test('socket drop: the client rejoins with the same identity, sync and mesh carry on', async () => {
  const party = await startParty({ n: 2, code: 'RCNN01' });
  try {
    const [leader, follower] = party.peers as [Peer, Peer];
    await waitForMesh(party.peers);
    await pressPlay(leader);
    await waitForCondition(async () => (await state(follower)).paused === false, { label: 'follower playing' });

    // The follower's socket dies like a network drop would (no leave frame).
    await follower.gj('dropSocket');
    await waitForCondition(async () => (await counters(follower)).socketReconnects >= 1, { timeout: 10_000, label: 'reconnected' });
    await waitForCondition(async () => { const s = await snapshot(follower); return s?.socket === 'connected' && s.room?.code === party.code && s.yourPeerId === 'peer2' && !s.isLeader; }, { timeout: 15_000, label: 'back in the room as the same peer' });
    // Leadership is untouched and everyone still sees each other.
    expect((await snapshot(leader))!.peers.map((p) => p.peerId).sort()).toEqual(['obs:harness', 'peer1', 'peer2']);
    expect((await snapshot(leader))!.isLeader).toBe(true);
    await waitForMesh(party.peers);
    await waitForCondition(async () => (await spreadMs(party.peers)).spread < 400, { timeout: 10_000, label: 'sync resumed' });
    // A seek from the leader still reaches the rejoined follower.
    await leader.page.click('#seek-fwd');
    await waitForCondition(async () => (await state(follower)).positionMs! > 50_000, { timeout: 5000, label: 'follower followed the seek after rejoin' });

    // Now the leader drops: leadership must survive the blip (grace period), not pass to the follower.
    await leader.gj('dropSocket');
    await waitForCondition(async () => { const s = await snapshot(leader); return s?.socket === 'connected' && s.room?.code === party.code && (await counters(leader)).socketReconnects >= 1; }, { timeout: 15_000, label: 'leader reconnected' });
    expect((await snapshot(leader))!.isLeader).toBe(true);
    expect((await snapshot(follower))!.isLeader).toBe(false);
    expect((await snapshot(follower))!.room!.leaderId).toBe('peer1');
  } catch (e) { await dumpParty(party, 'reconnect failure'); throw e; } finally { await party.close(); }
});
