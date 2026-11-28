import { describe, it, expect } from 'vitest';
import { participantsFrom } from '../lib/participants';

const base = {
  yourPeerId: 'me',
  room: { code: 'ABC123', leaderId: 'p2', contentId: null, watchUrl: null, positionMs: 0, paused: true, updatedAt: 0 },
  peers: [{ peerId: 'p2', name: 'Bea' }, { peerId: 'me', name: 'Ana' }, { peerId: 'obs:1', name: 'observer' }, { peerId: 'p3', name: 'Cy' }],
  peerMedia: {
    p2: { connectionState: 'connected', iceConnectionState: 'connected', signalingState: 'stable', hasAudio: true, hasVideo: true, speaking: true, micOn: false, camOn: true },
    p3: { connectionState: 'failed', iceConnectionState: 'failed', signalingState: 'stable', hasAudio: false, hasVideo: false, speaking: false, micOn: null, camOn: null },
  },
  speaking: true, micOn: false, camOn: false,
} as const;

describe('participantsFrom', () => {
  it('keeps server order by default, hides observers, marks self and leader, attaches media', () => {
    const ps = participantsFrom(base as never);
    expect(ps.map((p) => p.peerId)).toEqual(['p2', 'me', 'p3']);
    expect(ps[0]).toMatchObject({ name: 'Bea', self: false, leader: true, media: { hasVideo: true }, speaking: true, micOn: false, camOn: true, lost: false });
    expect(ps[1]).toMatchObject({ name: 'Ana', self: true, leader: false, media: null, speaking: true, micOn: false, camOn: false, lost: false });
    expect(ps[2]).toMatchObject({ name: 'Cy', self: false, leader: false, lost: true });
  });

  it('marks whoever stalled the room as buffering, and nobody else; self included, and before the room frame lists us', () => {
    const byId = (ps: ReturnType<typeof participantsFrom>) => Object.fromEntries(ps.map((p) => [p.peerId, p.buffering]));
    expect(byId(participantsFrom({ ...base, stalledBy: { peerId: 'p3', name: 'Cy' } } as never))).toEqual({ p2: false, me: false, p3: true });
    expect(byId(participantsFrom({ ...base, stalledBy: { peerId: 'me', name: 'you' } } as never))).toEqual({ p2: false, me: true, p3: false });
    expect(byId(participantsFrom({ ...base, stalledBy: null } as never))).toEqual({ p2: false, me: false, p3: false });
    expect(byId(participantsFrom({ ...base, peers: [], room: null, stalledBy: { peerId: 'me', name: 'you' } } as never))).toEqual({ me: true });
  });

  it('puts self first for the sidebar without reordering the others', () => {
    expect(participantsFrom(base as never, { selfFirst: true }).map((p) => p.peerId)).toEqual(['me', 'p2', 'p3']);
  });

  it('synthesises a self entry while the join is in flight, so the lone tile appears at once', () => {
    const ps = participantsFrom({ ...base, peers: [], room: null } as never, { selfFirst: true, selfName: 'Ana' });
    expect(ps).toEqual([{ peerId: 'me', name: 'Ana', self: true, leader: false, media: null, speaking: true, micOn: false, camOn: false, lost: false, buffering: false }]);
    expect(participantsFrom({ ...base, peers: [], room: null, yourPeerId: null } as never)).toEqual([]);
  });
});
