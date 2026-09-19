/**
 * Connection setup must not depend on the order signals happen to arrive in, or on
 * how long Chrome takes to call a stuck connection `failed`. Both cost tens of
 * seconds when they go wrong, and both used to be reachable from a normal join.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installFakeRtc, type FakePeerConnection } from './fakes';
import { PerfectPeer, ICE_STALL_MS } from '../lib/perfect-peer';

describe('PerfectPeer', () => {
  beforeEach(() => { installFakeRtc(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const make = (polite: boolean) => {
    const sent: unknown[] = [];
    const pp = new PerfectPeer(polite, (p) => sent.push(p), { iceServers: [] });
    return { pp, sent, pc: pp.pc as unknown as FakePeerConnection };
  };

  it('queues candidates that arrive before the remote description, then adds them in order', async () => {
    const { pp, pc } = make(true);
    // Trickle ICE puts the first candidates ahead of the answer they belong to.
    await pp.handle({ candidate: { candidate: 'a' } });
    await pp.handle({ candidate: { candidate: 'b' } });
    expect(pc.candidates).toEqual([]);

    await pp.handle({ description: { type: 'answer' } as RTCSessionDescriptionInit });
    expect(pc.candidates).toEqual([{ candidate: 'a' }, { candidate: 'b' }]);
  });

  it('adds candidates directly once a remote description exists', async () => {
    const { pp, pc } = make(true);
    await pp.handle({ description: { type: 'answer' } as RTCSessionDescriptionInit });
    await pp.handle({ candidate: { candidate: 'c' } });
    expect(pc.candidates).toEqual([{ candidate: 'c' }]);
  });

  it('keeps candidates that arrive while an impolite peer is ignoring a colliding offer', async () => {
    const { pp, pc } = make(false);
    pc.signalingState = 'have-local-offer';
    await pp.handle({ description: { type: 'offer' } as RTCSessionDescriptionInit }); // ignored: collision
    await pp.handle({ candidate: { candidate: 'x' } });
    expect(pc.candidates).toEqual([]);

    await pp.handle({ description: { type: 'answer' } as RTCSessionDescriptionInit });
    expect(pc.candidates).toEqual([{ candidate: 'x' }]);
  });

  it('restarts ICE when a connection is still not up after the stall budget', () => {
    const { pc } = make(false);
    expect(pc.restartIce).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ICE_STALL_MS + 1);
    expect(pc.restartIce).toHaveBeenCalledTimes(1);
  });

  it('does not restart ICE once connected', () => {
    const { pc } = make(false);
    pc.setState('connected');
    vi.advanceTimersByTime(ICE_STALL_MS * 3);
    expect(pc.restartIce).not.toHaveBeenCalled();
  });

  it('leaves the restart to the impolite side, so both do not re-offer at once', () => {
    const { pc } = make(true);
    vi.advanceTimersByTime(ICE_STALL_MS + 1);
    expect(pc.restartIce).not.toHaveBeenCalled();
  });

  it('stops its timer on close', () => {
    const { pp, pc } = make(false);
    pp.close();
    vi.advanceTimersByTime(ICE_STALL_MS * 3);
    expect(pc.restartIce).not.toHaveBeenCalled();
  });
});
