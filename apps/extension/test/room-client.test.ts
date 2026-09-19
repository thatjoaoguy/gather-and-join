import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFakeWebSocket, FakeWebSocket } from './fakes';
import { RoomClient } from '../lib/room-client';
import { PING_SAMPLES } from '@gj/shared';

const desired = { code: 'ABC123', peerId: 'p1', name: 'Ana', create: true };

describe('RoomClient', () => {
  beforeEach(() => { installFakeWebSocket(); vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const frames: unknown[] = []; const statuses: string[] = []; const failed = vi.fn();
    const c = new RoomClient('ws://x', (m) => frames.push(m), (s) => statuses.push(s), failed);
    return { c, frames, statuses, failed };
  };

  /** Drive the open handshake: open, answer the clock-sync pings with a 40ms RTT and a +5000ms server clock. */
  async function handshake(ws: FakeWebSocket) {
    ws.open();
    for (let i = 0; i < PING_SAMPLES; i++) {
      await vi.advanceTimersByTimeAsync(40);
      ws.answerPings(() => Date.now() + 5000);
    }
    await vi.advanceTimersByTimeAsync(0);
  }

  it('syncs the clock with 5 pings before joining, and estimates the offset from the best sample', async () => {
    const { c, statuses } = make();
    c.join(desired);
    expect(statuses).toEqual(['connecting']);
    const ws = FakeWebSocket.latest();
    await handshake(ws);
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(ws.sent).toEqual([{ type: 'join', ...desired }]);
    expect(c.rttMs).toBe(40);
    expect(c.offsetMs).toBe(5000 + 40 - 20); // pong arrived 40ms after the ping: serverTime - (clientTime + rtt/2)
  });

  it('reconnects after a drop, re-joins without create, and doubles the backoff only while attempts keep failing', async () => {
    const { c, statuses } = make();
    c.join(desired);
    const ws1 = FakeWebSocket.latest();
    await handshake(ws1);
    ws1.drop();
    expect(statuses.at(-1)).toBe('disconnected');
    expect(c.reconnects).toBe(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const ws2 = FakeWebSocket.latest();
    await handshake(ws2);
    expect(ws2.sent.at(-1)).toEqual({ type: 'join', ...desired, create: false });
    // A successful open resets the backoff; refused connects double it: 500, 1000, 2000.
    ws2.drop();
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeWebSocket.instances).toHaveLength(3);
    FakeWebSocket.latest().close(); // refused
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWebSocket.instances).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(4);
    FakeWebSocket.latest().close();
    await vi.advanceTimersByTimeAsync(1999);
    expect(FakeWebSocket.instances).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(5);
    expect(c.reconnects).toBe(4);
  });

  it('leave sends a leave frame, closes, and never reconnects', async () => {
    const { c } = make();
    c.join(desired);
    const ws = FakeWebSocket.latest();
    await handshake(ws);
    c.leave();
    expect(ws.sent.at(-1)).toEqual({ type: 'leave' });
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(c.status).toBe('disconnected');
  });

  it('reports a connection that never opened, and keeps retrying', async () => {
    const { c, failed } = make();
    c.join(desired);
    FakeWebSocket.latest().close(); // refused before open
    expect(failed).toHaveBeenCalledWith('ws://x');
    await vi.advanceTimersByTimeAsync(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(c.reconnects).toBe(1);
  });

  it('delivers non-pong frames to onFrame and drops frames that are not JSON', async () => {
    const { c, frames } = make();
    c.join(desired);
    const ws = FakeWebSocket.latest();
    await handshake(ws);
    ws.deliver({ type: 'peerJoined', peerId: 'p2', name: 'Bea' });
    ws.onmessage!({ data: '{not json' });
    expect(frames).toEqual([{ type: 'peerJoined', peerId: 'p2', name: 'Bea' }]);
  });
});
