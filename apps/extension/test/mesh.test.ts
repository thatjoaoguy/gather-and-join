import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installFakeRtc, FakePeerConnection, FakeTrack, FakeStream } from './fakes';
import { Mesh } from '../lib/mesh';

beforeEach(installFakeRtc);

const make = (myId = 'b', iceServers?: RTCIceServer[]) => {
  const sendSignal = vi.fn(); const onTrack = vi.fn(); const onState = vi.fn();
  return { mesh: new Mesh(myId, sendSignal, onTrack, onState, iceServers), sendSignal, onTrack, onState };
};

describe('Mesh', () => {
  it('adds one connection per remote peer, never for self or observers, and picks polite by id order', () => {
    const { mesh } = make('b');
    mesh.add('b'); mesh.add('obs:harness'); mesh.add('a'); mesh.add('c'); mesh.add('c');
    expect([...mesh.peers.keys()]).toEqual(['a', 'c']);
    expect(mesh.peers.get('a')!.pp.polite).toBe(true);  // 'b' > 'a': we are polite
    expect(mesh.peers.get('c')!.pp.polite).toBe(false); // 'b' < 'c': we offer
    expect(FakePeerConnection.instances).toHaveLength(2);
    expect((FakePeerConnection.instances[0]!.config as any).iceServers[0].urls).toMatch(/^stun:/);
  });

  it('routes signals to the right peer and adds a peer who signals before peerJoined arrived', async () => {
    const { mesh } = make('b');
    mesh.handleSignal('z', { description: { type: 'offer', sdp: 'o' } });
    expect(mesh.peers.has('z')).toBe(true);
    await Promise.resolve();
    expect(FakePeerConnection.instances[0]!.remoteDescriptions).toEqual([{ type: 'offer', sdp: 'o' }]);
    mesh.handleSignal('obs:x', { candidate: null });
    expect(mesh.peers.has('obs:x')).toBe(false);
  });

  it('adds, replaces and removes local tracks on every existing and future connection', () => {
    const { mesh } = make('b');
    mesh.add('a');
    const audio = new FakeTrack('audio');
    mesh.setAudioTrack(audio as never);
    mesh.add('c'); // joins after the mic was set
    const pcs = FakePeerConnection.instances;
    expect(pcs.map((pc) => pc.senders.length)).toEqual([1, 1]);
    const cam = new FakeTrack('video');
    mesh.setVideoTrack(cam as never);
    expect(pcs.map((pc) => pc.senders.length)).toEqual([2, 2]);
    const cam2 = new FakeTrack('video');
    mesh.setVideoTrack(cam2 as never);
    expect(pcs[0]!.senders[1]!.replaceTrack).toHaveBeenCalledWith(cam2);
    mesh.setVideoTrack(null);
    expect(pcs.map((pc) => pc.senders.length)).toEqual([1, 1]);
  });

  it('surfaces remote tracks and state changes, and closes on remove', () => {
    const { mesh, onTrack, onState } = make('b');
    mesh.add('a');
    const pc = FakePeerConnection.instances[0]!;
    const t = new FakeTrack('audio'); const s = new FakeStream([t]);
    pc.receive(t, s);
    expect(onTrack).toHaveBeenCalledWith('a', s, t);
    expect(mesh.peers.get('a')!.stream).toBe(s);
    pc.setState('connected');
    expect(onState).toHaveBeenCalledWith('a');
    mesh.removeAll();
    expect(pc.closed).toBe(true);
    expect(mesh.peers.size).toBe(0);
  });

  it('uses the ICE servers it is given, so tests can stay on host candidates', () => {
    const { mesh } = make('b', []);
    mesh.add('c');
    expect((FakePeerConnection.instances[0]!.config as any).iceServers).toEqual([]);
  });

});
