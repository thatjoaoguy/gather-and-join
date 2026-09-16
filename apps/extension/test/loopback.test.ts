import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installFakeRtc, FakePeerConnection, FakeTrack, FakeStream } from './fakes';
import { LoopbackSender } from '../lib/loopback-sender';
import { LoopbackReceiver } from '../lib/sidebar/loopback-receiver';

beforeEach(installFakeRtc);

describe('LoopbackSender (offscreen side)', () => {
  it('announces owners on add/remove and swaps a repeated peer in place', () => {
    const tracks = vi.fn();
    const lb = new LoopbackSender(() => {}, tracks);
    const s1 = new FakeStream([new FakeTrack('video')], 'stream-a');
    lb.add('p2', 'Bea', s1.getVideoTracks()[0]! as never, s1 as never);
    expect(tracks).toHaveBeenLastCalledWith([{ peerId: 'p2', name: 'Bea', streamId: 'stream-a' }]);
    expect(lb.pc).toBeInstanceOf(FakePeerConnection);
    const pc = lb.pc as unknown as FakePeerConnection;
    expect(pc.config).toEqual({ iceServers: [] }); // local only, no STUN
    expect(pc.senders).toHaveLength(1);

    const replacement = new FakeTrack('video');
    lb.add('p2', 'Bea', replacement as never, s1 as never);
    expect(pc.senders).toHaveLength(1);
    expect(pc.senders[0]!.replaceTrack).toHaveBeenCalledWith(replacement);
    expect(tracks).toHaveBeenCalledTimes(1);

    lb.remove('p2');
    expect(pc.senders).toHaveLength(0);
    expect(tracks).toHaveBeenLastCalledWith([]);
    lb.remove('p2'); // idempotent
    expect(tracks).toHaveBeenCalledTimes(2);
    lb.close();
    expect(pc.closed).toBe(true);
  });

  it('is the impolite side: it offers when negotiation is needed and signals through the port', async () => {
    const signal = vi.fn();
    const lb = new LoopbackSender(signal, () => {});
    const pc = lb.pc as unknown as FakePeerConnection;
    await pc.onnegotiationneeded!();
    expect(signal).toHaveBeenCalledWith({ description: { type: 'offer', sdp: 'x' } });
  });
});

describe('LoopbackReceiver (page side)', () => {
  it('maps incoming streams to peers via the announced owners and follows mute/unmute', () => {
    const change = vi.fn();
    const rx = new LoopbackReceiver(() => {}, change);
    rx.open();
    expect(rx.isOpen).toBe(true);
    const pc = FakePeerConnection.instances[0]!;
    const track = new FakeTrack('video');
    const stream = new FakeStream([track], 'stream-a');
    pc.receive(track, stream);
    expect(rx.streamFor('p2')).toBeNull(); // no owner known yet
    rx.setTracks([{ peerId: 'p2', name: 'Bea', streamId: 'stream-a' }]);
    expect(rx.streamFor('p2')).toBe(stream);
    track.mute();
    expect(rx.streamFor('p2')).toBeNull();
    track.unmute();
    expect(rx.streamFor('p2')).toBe(stream);
    track.end();
    expect(rx.streamFor('p2')).toBeNull();
    expect(change).toHaveBeenCalled();
    rx.close();
    expect(rx.isOpen).toBe(false);
    expect(pc.closed).toBe(true);
  });

  it('opens itself on the first signal, as the polite side', async () => {
    const rx = new LoopbackReceiver(() => {}, () => {});
    rx.handleSignal({ description: { type: 'offer', sdp: 'y' } });
    expect(rx.isOpen).toBe(true);
    await Promise.resolve();
    const pc = FakePeerConnection.instances[0]!;
    expect(pc.remoteDescriptions).toEqual([{ type: 'offer', sdp: 'y' }]);
  });
});
