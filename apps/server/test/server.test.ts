import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import type { C2S, S2C } from '@gj/shared';

process.env.ROOM_TTL_MS = '200';
process.env.LEADER_GRACE_MS = '300';
process.env.GJ_LOG = '0';
const { startServer, _rooms, _setLogSink } = await import('../src/index.ts');

const PORT = 18_081;
let server: ReturnType<typeof startServer>;
beforeAll(() => { server = startServer(PORT); });
afterAll(() => server.close());

class Client {
  ws: WebSocket;
  inbox: S2C[] = [];
  private waiters: Array<{ pred: (m: S2C) => boolean; resolve: (m: S2C) => void }> = [];
  constructor() {
    this.ws = new WebSocket(`ws://localhost:${PORT}`);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as S2C;
      this.inbox.push(m);
      this.waiters = this.waiters.filter((w) => { if (w.pred(m)) { w.resolve(m); return false; } return true; });
    });
  }
  open() { return new Promise<void>((r) => this.ws.once('open', () => r())); }
  send(m: C2S) { this.ws.send(JSON.stringify(m)); }
  next<T extends S2C['type']>(type: T, timeout = 2000): Promise<Extract<S2C, { type: T }>> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
      this.waiters.push({ pred: (m) => m.type === type, resolve: (m) => { clearTimeout(t); resolve(m as never); } });
    });
  }
  close() { this.ws.close(); }
}

async function client() { const c = new Client(); await c.open(); return c; }

describe('server', () => {
  it('create/join, leader assignment, playback broadcast, leader-only navigate', async () => {
    const a = await client(); const b = await client();
    a.send({ type: 'join', code: 'RM0001', peerId: 'a', name: 'A', create: true });
    const roomA = await a.next('room');
    expect(roomA.isLeader).toBe(true);
    expect(roomA.state.leaderId).toBe('a');

    // Joining a nonexistent room fails; creating an existing one fails.
    b.send({ type: 'join', code: 'NXPE00', peerId: 'b', name: 'B' });
    expect((await b.next('error')).code).toBe('ROOM_NOT_FOUND');
    b.send({ type: 'join', code: 'RM0001', peerId: 'b', name: 'B', create: true });
    expect((await b.next('error')).code).toBe('ROOM_EXISTS');

    const joinedP = a.next('peerJoined');
    b.send({ type: 'join', code: 'RM0001', peerId: 'b', name: 'B' });
    const roomB = await b.next('room');
    expect(roomB.isLeader).toBe(false);
    expect(roomB.peers.map((p) => p.peerId).sort()).toEqual(['a', 'b']);
    expect((await joinedP).peerId).toBe('b');

    // hello from first peer sets content and broadcasts navigate.
    const navP = b.next('navigate');
    a.send({ type: 'hello', contentId: 'urn:hbo:episode:G1', watchUrl: 'http://x/watch/urn:hbo:episode:G1' });
    expect(await navP).toMatchObject({ contentId: 'urn:hbo:episode:G1', watchUrl: 'http://x/watch/urn:hbo:episode:G1' });

    // Anyone may drive playback; it's rebroadcast to everyone including origin.
    const pbA = a.next('playback'); const pbB = b.next('playback');
    b.send({ type: 'playback', paused: false, positionMs: 1234, clientTime: 1 });
    const [ra, rb] = await Promise.all([pbA, pbB]);
    expect(ra).toMatchObject({ paused: false, positionMs: 1234, originPeerId: 'b' });
    expect(rb.serverTime).toBeGreaterThan(0);

    // Non-leader navigate is rejected explicitly and nobody is told to move.
    b.send({ type: 'navigate', contentId: 'urn:hbo:episode:G2' });
    expect((await b.next('error')).code).toBe('NOT_LEADER');
    expect(a.inbox.filter((m) => m.type === 'navigate').length).toBe(1);

    // Leader navigate propagates and resets position.
    const navB = b.next('navigate');
    a.send({ type: 'navigate', contentId: 'urn:hbo:episode:G2' });
    expect((await navB).contentId).toBe('urn:hbo:episode:G2');
    expect(_rooms().get('RM0001')!.state).toMatchObject({ contentId: 'urn:hbo:episode:G2', positionMs: 0, paused: true });

    // Signal relay is verbatim, addressed.
    const sigB = b.next('signal');
    a.send({ type: 'signal', to: 'b', payload: { sdp: 'v=0 blah', nested: [1, 2] } });
    expect(await sigB).toEqual({ type: 'signal', from: 'a', payload: { sdp: 'v=0 blah', nested: [1, 2] } });
    a.send({ type: 'signal', to: 'zzz', payload: {} });
    expect((await a.next('error')).code).toBe('NO_SUCH_PEER');

    // Leader leaves → leadership is held for the grace period, then the oldest remaining peer inherits.
    const leftP = b.next('peerLeft');
    a.close();
    expect(await leftP).toMatchObject({ peerId: 'a', leaderId: 'a' });
    expect((await b.next('leader')).leaderId).toBe('b');

    // Last peer leaves → room expires after TTL.
    b.close();
    await new Promise((r) => setTimeout(r, 400));
    expect(_rooms().has('RM0001')).toBe(false);
  });

  it('a rejoin with the same peerId takes over the stale socket', async () => {
    const a = await client(); const b = await client();
    a.send({ type: 'join', code: 'TK0001', peerId: 'a', name: 'A', create: true });
    await a.next('room');
    b.send({ type: 'join', code: 'TK0001', peerId: 'b', name: 'B' });
    await b.next('room');
    // "a" drops silently (no leave, no close seen yet) and reconnects with the same id.
    const a2 = await client();
    const leftP = b.next('peerLeft'); const joinedP = b.next('peerJoined');
    a2.send({ type: 'join', code: 'TK0001', peerId: 'a', name: 'A' });
    const room = await a2.next('room');
    expect(room.isLeader).toBe(true); // identity, and leadership, carry over
    expect((await leftP).peerId).toBe('a');
    expect((await joinedP).peerId).toBe('a');
    expect(_rooms().get('TK0001')!.peers.get('a')!.socket).not.toBe(a.ws);
    a2.close(); b.close(); a.close();
  });

  it('a leader who reconnects within the grace period is still the leader', async () => {
    const a = await client(); const b = await client();
    a.send({ type: 'join', code: 'GRC001', peerId: 'a', name: 'A', create: true }); await a.next('room');
    b.send({ type: 'join', code: 'GRC001', peerId: 'b', name: 'B' }); await b.next('room');
    const leftP = b.next('peerLeft');
    a.close();
    expect((await leftP).leaderId).toBe('a');
    const a2 = await client();
    a2.send({ type: 'join', code: 'GRC001', peerId: 'a', name: 'A' });
    expect((await a2.next('room')).isLeader).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    expect(_rooms().get('GRC001')!.state.leaderId).toBe('a');
    expect(b.inbox.some((m) => m.type === 'leader')).toBe(false);
    a2.close(); b.close();
  });

  it('ping/pong carries clientTime and serverTime; bad frames get errors', async () => {
    const c = await client();
    c.send({ type: 'ping', clientTime: 42 });
    const pong = await c.next('pong');
    expect(pong.clientTime).toBe(42);
    expect(Math.abs(pong.serverTime - Date.now())).toBeLessThan(1000);
    c.send({ type: 'playback', paused: false, positionMs: 0, clientTime: 0 });
    expect((await c.next('error')).code).toBe('NOT_IN_ROOM');
    c.ws.send('not json');
    expect((await c.next('error')).code).toBe('BAD_MESSAGE');
    c.close();
  });

  it('media state is relayed to the others and remembered for late joiners', async () => {
    const a = await client(); const b = await client(); const c = await client();
    a.send({ type: 'join', code: 'RM0005', peerId: 'a', name: 'A', create: true });
    await a.next('room');
    b.send({ type: 'join', code: 'RM0005', peerId: 'b', name: 'B' });
    await b.next('room'); await a.next('peerJoined');
    const seenByB = b.next('media');
    a.send({ type: 'media', micOn: false, camOn: true });
    expect(await seenByB).toEqual({ type: 'media', from: 'a', micOn: false, camOn: true });
    expect(a.inbox.some((m) => m.type === 'media')).toBe(false); // not echoed to the sender
    c.send({ type: 'join', code: 'RM0005', peerId: 'c', name: 'C' });
    const room = await c.next('room');
    expect(room.peers.find((p) => p.peerId === 'a')?.media).toEqual({ micOn: false, camOn: true });
    expect(room.peers.find((p) => p.peerId === 'b')?.media).toBeUndefined();
    a.close(); b.close(); c.close();
  });

  it('writes one greppable key=value line per room event, and nothing for playback or signaling', async () => {
    const lines: string[] = [];
    _setLogSink((l) => lines.push(l));
    try {
      const a = await client(); const b = await client();
      a.send({ type: 'join', code: 'EV0001', peerId: 'a', name: 'Ana B', create: true }); await a.next('room');
      b.send({ type: 'join', code: 'NX0002', peerId: 'b', name: 'B' }); await b.next('error');
      const joined = a.next('peerJoined');
      b.send({ type: 'join', code: 'EV0001', peerId: 'b', name: 'B' }); await b.next('room'); await joined;
      const nav = b.next('navigate');
      a.send({ type: 'hello', contentId: 'urn:hbo:episode:G1' }); await nav;
      const pb = a.next('playback');
      b.send({ type: 'playback', paused: false, positionMs: 500, clientTime: 1 }); await pb;
      const sig = b.next('signal');
      a.send({ type: 'signal', to: 'b', payload: {} }); await sig;
      const stall = a.next('playback');
      b.send({ type: 'playback', paused: true, positionMs: 4321.7, clientTime: 2, reason: 'stall' }); await stall;
      b.send({ type: 'navigate', contentId: 'urn:hbo:episode:G2' }); await b.next('error');
      const left = a.next('peerLeft');
      b.send({ type: 'leave' }); await left;
      a.close();
      await new Promise((r) => setTimeout(r, 400));

      // Only this test's rooms: earlier tests' rooms may expire while this one runs.
      const events = lines.map((l) => l.replace(/^\S+ /, '').replace(/ rooms=\d+/, ' rooms=N')).filter((l) => /room=(EV0001|NX0002)/.test(l));
      expect(events).toEqual([
        'room_created room=EV0001 peer=a name="Ana B" rooms=N',
        'peer_joined room=EV0001 peer=a name="Ana B" peers=1 leader=a',
        'join_rejected room=NX0002 peer=b error=ROOM_NOT_FOUND',
        'peer_joined room=EV0001 peer=b name=B peers=2 leader=a',
        'content_set room=EV0001 peer=a content=urn:hbo:episode:G1',
        'stall room=EV0001 peer=b name=B positionMs=4322',
        'navigate_rejected room=EV0001 peer=b content=urn:hbo:episode:G2 leader=a',
        'peer_left room=EV0001 peer=b name=B reason=leave peers=1 leader=a',
        'peer_left room=EV0001 peer=a name="Ana B" reason=close peers=0 leader=a',
        'room_expired room=EV0001',
      ]);
      for (const l of lines) expect(l).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z /);
    } finally {
      _setLogSink(() => {});
    }
  });
});

describe('http surface', () => {
  const get = async (path: string, init?: RequestInit) => {
    const res = await fetch(`http://localhost:${PORT}${path}`, init);
    return { status: res.status, type: res.headers.get('content-type'), body: await res.text() };
  };

  it('answers / with plain text instead of the 426 ws sends, so a host checking the address sees it working', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/text\/plain/);
    expect(res.body).toContain('running');
  });

  it('reports health as JSON, counting live rooms and peers', async () => {
    const before = JSON.parse((await get('/health')).body);
    expect(before).toMatchObject({ status: 'ok' });
    expect(typeof before.version).toBe('string');
    expect(before.uptimeSec).toBeGreaterThanOrEqual(0);

    const a = await client();
    a.send({ type: 'join', code: 'HTH001', peerId: 'a', name: 'A', create: true });
    await a.next('room');
    const during = JSON.parse((await get('/health')).body);
    expect(during.rooms).toBe(before.rooms + 1);
    expect(during.peers).toBe(before.peers + 1);
    a.close();
    await new Promise((r) => setTimeout(r, 400));
  });

  it('404s anything else and refuses non-GET', async () => {
    expect((await get('/admin')).status).toBe(404);
    expect((await get('/health', { method: 'POST' })).status).toBe(405);
  });
});
