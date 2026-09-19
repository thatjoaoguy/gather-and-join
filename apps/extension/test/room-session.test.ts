import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { S2C, C2S } from '@gj/shared';
import { RoomSession, type ClientHandlers, type MeshHandlers, type SessionClient, type SessionMesh, type SessionEvents, type ServerProbe } from '../lib/room-session';
import { FakeTrack, FakeStream, FakePeerConnection, installFakeRtc } from './fakes';

/** A room client that records what the session sends and lets the test play the server. */
function fakeClient() {
  let handlers: ClientHandlers;
  const client = {
    url: '', status: 'disconnected' as SessionClient['status'], offsetMs: 0, reconnects: 0,
    sent: [] as C2S[], joins: [] as Array<{ code: string; peerId: string; name: string; create: boolean }>, rejoins: [] as boolean[], leaves: 0,
    join(d: { code: string; peerId: string; name: string; create: boolean }) { this.joins.push(d); },
    rejoin(create = false) { this.rejoins.push(create); },
    leave() { this.leaves++; this.status = 'disconnected'; },
    send(m: C2S) { this.sent.push(m); },
    syncClock: vi.fn(async () => {}),
    dropForTest: vi.fn(),
    // test controls
    connect() { this.status = 'connected'; handlers.onStatus('connected'); },
    disconnect() { this.status = 'disconnected'; handlers.onStatus('disconnected'); },
    frame(m: S2C) { handlers.onFrame(m); },
    fail(url: string) { handlers.onConnectFailed(url); },
  };
  return { client, create: (url: string, h: ClientHandlers) => { client.url = url; handlers = h; return client; } };
}

function fakeMesh() {
  let handlers: MeshHandlers;
  const peers = new Map<string, { pp: { pc: FakePeerConnection }; stream: FakeStream | null }>();
  const mesh = {
    peers, myId: '', audio: null as FakeTrack | null, video: null as FakeTrack | null, removedAll: 0, signals: [] as Array<[string, unknown]>,
    add(id: string) { if (!peers.has(id)) peers.set(id, { pp: { pc: new FakePeerConnection({}) }, stream: null }); },
    remove(id: string) { peers.delete(id); },
    removeAll() { peers.clear(); this.removedAll++; },
    handleSignal(from: string, payload: unknown) { this.signals.push([from, payload]); },
    setAudioTrack(t: FakeTrack | null) { this.audio = t; },
    setVideoTrack(t: FakeTrack | null) { this.video = t; },
    // test controls
    receive(from: string, stream: FakeStream, track: FakeTrack) { peers.get(from)!.stream = stream; handlers.onTrack(from, stream as never, track as never); },
    connected(from: string) { peers.get(from)!.pp.pc.connectionState = 'connected'; handlers.onStateChange(from); },
  };
  return { mesh, create: (myId: string, h: MeshHandlers) => { mesh.myId = myId; handlers = h; return mesh as unknown as SessionMesh; } };
}

function fakeLocal(opts: { mic?: boolean; cam?: 'ok' | 'denied' | 'none' } = {}) {
  const micTrack = new FakeTrack('audio');
  const camTrack = new FakeTrack('video');
  const local = {
    micStream: null as FakeStream | null, camStream: null as FakeStream | null,
    micPermission: 'unknown' as 'unknown' | 'granted' | 'denied', camPermission: 'unknown' as 'unknown' | 'granted' | 'denied',
    async ensureMic() { if (opts.mic === false) { this.micPermission = 'denied'; return null; } this.micStream = new FakeStream([micTrack]); this.micPermission = 'granted'; return micTrack; },
    async ensureCamera() {
      if (opts.cam === 'denied') { this.camPermission = 'denied'; return null; }
      if (opts.cam === 'none') return null;
      this.camStream = new FakeStream([camTrack], 'cam'); this.camPermission = 'granted'; return camTrack;
    },
    stopCamera() { this.camStream = null; },
    stopMic() { this.micStream = null; micTrack.readyState = 'ended'; },
  };
  return { local, micTrack, camTrack };
}

function kv() {
  const store = { local: {} as Record<string, unknown>, session: {} as Record<string, unknown> };
  return {
    store,
    async get(area: 'local' | 'session', keys: string[] | null) { const s = store[area]; if (!keys) return { ...s }; const o: Record<string, unknown> = {}; for (const k of keys) if (k in s) o[k] = s[k]; return o; },
    async set(area: 'local' | 'session', data: Record<string, unknown>) { Object.assign(store[area], data); },
  };
}

function setup(opts: { local?: ReturnType<typeof fakeLocal>; kvStore?: ReturnType<typeof kv>; testPeerId?: string | null; codes?: string[] } = {}) {
  const c = fakeClient(); const m = fakeMesh();
  const l = opts.local ?? fakeLocal();
  const storage = opts.kvStore ?? kv();
  const remote = { attach: vi.fn(), detach: vi.fn() };
  const events = {
    snapshot: vi.fn<SessionEvents['snapshot']>(), playback: vi.fn<SessionEvents['playback']>(), navigate: vi.fn<SessionEvents['navigate']>(),
    duck: vi.fn<SessionEvents['duck']>(), videoAdded: vi.fn<SessionEvents['videoAdded']>(), videoRemoved: vi.fn<SessionEvents['videoRemoved']>(),
  };
  const codes = [...(opts.codes ?? ['RM0001', 'RM0002', 'RM0003', 'RM0004', 'RM0005', 'RM0006', 'RM0007'])];
  const probe = vi.fn<ServerProbe>(async () => ({ ok: true, rttMs: 12 }));
  const session = new RoomSession({
    createClient: c.create, createMesh: m.create, probe, local: l.local as never, remote, kv: storage,
    readTestConfig: async () => ({ sabotage: null, testPeerId: opts.testPeerId ?? null, serverUrl: null, iceServers: null }),
    defaultServerUrl: 'ws://default', now: () => Date.now(), newPeerId: () => 'me', newRoomCode: () => codes.shift()!,
  }, events);
  return { session, client: c.client, mesh: m.mesh, local: l, remote, events, kv: storage, probe };
}

type RoomFrame = Extract<S2C, { type: 'room' }>;
const roomFrame = (over: Partial<RoomFrame> = {}): RoomFrame => ({
  type: 'room', yourPeerId: 'me', isLeader: true,
  state: { code: 'RM0001', leaderId: 'me', contentId: null, watchUrl: null, positionMs: 0, paused: true, updatedAt: 0 },
  peers: [{ peerId: 'me', name: 'Ana' }], ...over,
});

describe('RoomSession', () => {
  beforeEach(() => { installFakeRtc(); vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
  afterEach(() => vi.useRealTimers());

  it('creates a room: joins with create, wires the mic into the mesh, adopts the room frame and persists it', async () => {
    const { session, client, mesh, events, kv } = setup();
    await session.createRoom('Ana');
    expect(client.joins).toEqual([{ code: 'RM0001', peerId: 'me', name: 'Ana', create: true }]);
    expect(session.snapshot).toMatchObject({ joining: true, yourPeerId: 'me', serverUrl: 'ws://default', micPermission: 'granted' });
    expect(mesh.audio?.kind).toBe('audio');
    client.connect();
    client.frame(roomFrame({ peers: [{ peerId: 'me', name: 'Ana' }, { peerId: 'p2', name: 'Bea' }, { peerId: 'obs:1', name: 'obs' }] }));
    expect(session.snapshot).toMatchObject({ joining: false, isLeader: true, room: { code: 'RM0001' }, lastError: null });
    expect([...mesh.peers.keys()]).toEqual(['p2', 'obs:1']); // the real Mesh filters observers; the session hands over everyone else
    await vi.advanceTimersByTimeAsync(0);
    expect(kv.store.session.gjDesiredRoom).toEqual({ code: 'RM0001', peerId: 'me', name: 'Ana' });
    expect(events.snapshot).toHaveBeenCalled();
  });

  it('reads the server URL from storage at join time', async () => {
    const storage = kv(); storage.store.local.serverUrl = 'wss://house';
    const { session, client } = setup({ kvStore: storage });
    await session.joinRoom('rm0001', 'Ana');
    expect(client.url).toBe('wss://house');
    expect(session.snapshot.serverUrl).toBe('wss://house');
    expect(client.joins[0]).toMatchObject({ code: 'RM0001', create: false }); // normalised
  });

  it('rejects a malformed room code before touching the socket', async () => {
    const { session, client } = setup();
    await session.joinRoom('nope', 'Ana');
    expect(client.joins).toHaveLength(0);
    expect(session.snapshot.lastError?.code).toBe('BAD_CODE');
  });

  it('retries a create with a fresh code on ROOM_EXISTS, up to five times, then gives up', async () => {
    const { session, client } = setup();
    await session.createRoom('Ana');
    for (let i = 0; i < 5; i++) { client.frame({ type: 'error', code: 'ROOM_EXISTS', message: 'x' }); await vi.advanceTimersByTimeAsync(0); }
    expect(client.joins.map((j) => j.code)).toEqual(['RM0001', 'RM0002', 'RM0003', 'RM0004', 'RM0005', 'RM0006']);
    client.frame({ type: 'error', code: 'ROOM_EXISTS', message: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    expect(client.joins).toHaveLength(6);
    expect(client.leaves).toBe(1);
    expect(session.snapshot.lastError?.code).toBe('ROOM_EXISTS');
  });

  it('announces content: hello when the room has none, navigate only from the leader when it differs', async () => {
    const { session, client } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    session.setContent({ contentId: 'urn:hbo:episode:G1', url: 'http://l/watch/G1' });
    expect(client.sent).toEqual([]); // not in a room yet
    client.frame(roomFrame({ isLeader: false }));
    expect(client.sent.at(-1)).toEqual({ type: 'hello', contentId: 'urn:hbo:episode:G1', watchUrl: 'http://l/watch/G1' });
    client.frame({ type: 'navigate', contentId: 'urn:hbo:episode:G1', watchUrl: 'http://l/watch/G1', originPeerId: 'me' });
    session.setContent({ contentId: 'urn:hbo:episode:G2', url: 'http://l/watch/G2' });
    expect(client.sent.filter((m) => m.type === 'navigate')).toEqual([]); // follower wandering off does not move the room
    client.frame({ type: 'leader', leaderId: 'me' });
    session.setContent({ contentId: 'urn:hbo:episode:G2', url: 'http://l/watch/G2' });
    expect(client.sent.at(-1)).toEqual({ type: 'navigate', contentId: 'urn:hbo:episode:G2', watchUrl: 'http://l/watch/G2' });
  });

  it('forwards playback and navigate frames to the player with the clock offset, and names who stalled', async () => {
    const { session, client, events } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame({ peers: [{ peerId: 'me', name: 'Ana' }, { peerId: 'p2', name: 'Bea' }] }));
    client.offsetMs = 123;
    client.frame({ type: 'playback', paused: false, positionMs: 5000, serverTime: 42, originPeerId: 'p2' });
    expect(events.playback).toHaveBeenLastCalledWith({ paused: false, positionMs: 5000, serverTime: 42, originPeerId: 'p2', offsetMs: 123 });
    expect(session.snapshot.room).toMatchObject({ paused: false, positionMs: 5000, updatedAt: 42 });
    client.frame({ type: 'playback', paused: true, positionMs: 5000, serverTime: 43, originPeerId: 'p2', reason: 'stall' });
    expect(session.snapshot.stalledBy).toEqual({ peerId: 'p2', name: 'Bea' });
    client.frame({ type: 'playback', paused: false, positionMs: 5000, serverTime: 44, originPeerId: 'me' });
    expect(session.snapshot.stalledBy).toBeNull();
    client.frame({ type: 'navigate', contentId: 'urn:hbo:episode:G2', watchUrl: 'http://l/G2', originPeerId: 'me' });
    expect(events.navigate).toHaveBeenLastCalledWith({ contentId: 'urn:hbo:episode:G2', watchUrl: 'http://l/G2', originPeerId: 'me' });
    expect(session.snapshot.room).toMatchObject({ contentId: 'urn:hbo:episode:G2', positionMs: 0, paused: true });
    session.playback(true, 7000);
    session.stalled();
    expect(client.sent.slice(-2)).toEqual([
      { type: 'playback', paused: true, positionMs: 7000, clientTime: 1_000_000 },
      { type: 'playback', paused: true, positionMs: 0, clientTime: 1_000_000, reason: 'stall' },
    ]);
  });

  it('tracks peers joining and leaving: mesh membership, leadership handover, stalled-by cleanup', async () => {
    const { session, client, mesh, remote, events } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame({ isLeader: false, state: { ...roomFrame().state, leaderId: 'p2' }, peers: [{ peerId: 'p2', name: 'Bea' }, { peerId: 'me', name: 'Ana' }] }));
    client.frame({ type: 'peerJoined', peerId: 'p3', name: 'Cy' });
    expect(session.snapshot.peers.map((p) => p.peerId)).toEqual(['p2', 'me', 'p3']);
    expect(mesh.peers.has('p3')).toBe(true);
    client.frame({ type: 'playback', paused: true, positionMs: 0, serverTime: 1, originPeerId: 'p2', reason: 'stall' });
    client.frame({ type: 'peerLeft', peerId: 'p2', leaderId: 'me' });
    expect(session.snapshot).toMatchObject({ isLeader: true, stalledBy: null, room: { leaderId: 'me' } });
    expect(mesh.peers.has('p2')).toBe(false);
    expect(remote.detach).toHaveBeenCalledWith('p2');
    expect(events.videoRemoved).toHaveBeenCalledWith('p2');
    client.frame({ type: 'peerLeft', peerId: 'me', leaderId: 'me' }); // our own stale socket being evicted
    expect(session.snapshot.peers.map((p) => p.peerId)).toEqual(['me', 'p3']);
  });

  it('re-streams remote camera tracks to the loopbacks and follows mute/unmute, and syncs the clock once per peer', async () => {
    const { session, client, mesh, remote, events } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame({ peers: [{ peerId: 'me', name: 'Ana' }, { peerId: 'p2', name: 'Bea' }] }));
    const track = new FakeTrack('video'); const stream = new FakeStream([new FakeTrack('audio'), track]);
    mesh.receive('p2', stream, track);
    expect(remote.attach).toHaveBeenCalledWith('p2', stream);
    expect(events.videoAdded).toHaveBeenLastCalledWith({ peerId: 'p2', name: 'Bea', track, stream });
    expect(session.snapshot.peerMedia.p2).toMatchObject({ hasAudio: true, hasVideo: true });
    track.mute();
    expect(events.videoRemoved).toHaveBeenLastCalledWith('p2');
    expect(session.snapshot.peerMedia.p2?.hasVideo).toBe(false);
    track.unmute();
    expect(events.videoAdded).toHaveBeenCalledTimes(2);
    expect(session.liveVideos()).toEqual([{ peerId: 'p2', name: 'Bea', track, stream }]);
    mesh.connected('p2'); mesh.connected('p2');
    expect(client.syncClock).toHaveBeenCalledTimes(1);
    expect(session.snapshot.peerMedia.p2?.connectionState).toBe('connected');
  });

  it('camera: on adds the track to the mesh and a self-view; denied reports why; off removes both', async () => {
    const denied = fakeLocal({ cam: 'denied' });
    const a = setup({ local: denied });
    await a.session.joinRoom('RM0001', 'Ana');
    await a.session.setCamera(true);
    expect(a.session.snapshot).toMatchObject({ camOn: false, camPermission: 'denied', lastError: { code: 'CAMERA_NOT_ALLOWED' } });

    const ok = fakeLocal();
    const b = setup({ local: ok });
    await b.session.joinRoom('RM0001', 'Ana');
    await b.session.setCamera(true);
    expect(b.mesh.video).toBe(ok.camTrack);
    expect(b.events.videoAdded).toHaveBeenLastCalledWith({ peerId: 'me', name: 'You', track: ok.camTrack, stream: ok.local.camStream });
    expect(b.session.liveVideos().map((v) => v.peerId)).toEqual(['me']);
    await b.session.setCamera(false);
    expect(b.mesh.video).toBeNull();
    expect(b.events.videoRemoved).toHaveBeenLastCalledWith('me');
    expect(b.session.snapshot.camOn).toBe(false);
  });

  it('mic: toggling flips the track; a late grant wires the mic into the mesh', async () => {
    const noMic = fakeLocal({ mic: false });
    const { session, mesh, local } = setup({ local: noMic });
    await session.joinRoom('RM0001', 'Ana');
    expect(session.snapshot.micPermission).toBe('denied');
    expect(mesh.audio).toBeNull();
    (local.local as any).ensureMic = async () => { local.local.micStream = new FakeStream([local.micTrack]); local.local.micPermission = 'granted'; return local.micTrack; };
    session.setMic(false);
    await session.micGranted();
    expect(mesh.audio).toBe(local.micTrack);
    expect(local.micTrack.enabled).toBe(false); // honours the mic-off chosen before the grant
    session.setMic(true);
    expect(local.micTrack.enabled).toBe(true);
    expect(session.snapshot.micPermission).toBe('granted');
  });

  it('ducking only fires when enabled, and un-ducks when disabled mid-speech', async () => {
    const { session, events } = setup();
    session.onSpeaking(true);
    expect(events.duck).not.toHaveBeenCalled();
    session.setDucking(true);
    session.onSpeaking(true);
    expect(events.duck).toHaveBeenLastCalledWith(true);
    expect(session.ducked).toBe(true);
    session.setDucking(false);
    expect(events.duck).toHaveBeenLastCalledWith(false);
    expect(session.ducked).toBe(false);
  });

  it('reconnection: PEER_ID_TAKEN retries after 2s; ROOM_NOT_FOUND makes the old leader re-create and followers wait 3s', async () => {
    const { session, client } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame({ isLeader: true }));
    client.disconnect();
    expect(session.snapshot.lastError?.code).toBe('RECONNECTING');
    client.connect();
    expect(session.snapshot.lastError).toBeNull();
    client.frame({ type: 'error', code: 'PEER_ID_TAKEN', message: 'x' });
    expect(client.rejoins).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.rejoins).toEqual([false]);
    client.frame({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' });
    expect(client.rejoins).toEqual([false, true]); // we led: re-create with the same code, at once
    expect(session.snapshot.lastError?.code).toBe('RECONNECTING');

    const f = setup();
    await f.session.joinRoom('RM0001', 'Bea');
    f.client.connect();
    f.client.frame(roomFrame({ isLeader: false, yourPeerId: 'me' }));
    f.client.frame({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' });
    expect(f.client.rejoins).toEqual([]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.client.rejoins).toEqual([false]);

    const g = setup(); // never in a room: a not-found join is a plain error and we leave
    await g.session.joinRoom('RM0001', 'Cy');
    g.client.frame({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' });
    expect(g.client.leaves).toBe(1);
    expect(g.session.snapshot).toMatchObject({ joining: false, lastError: { code: 'ROOM_NOT_FOUND' } });
  });

  it('ends the room for good once ROOM_NOT_FOUND retries run out, instead of pinning the UI on reconnecting', async () => {
    // WebRTC needs the server only to introduce peers, so the mesh keeps carrying audio
    // and video long after the socket is gone. Leaving the room in the snapshot meant a
    // popup stuck on "Reconnecting…" forever over a call that looked perfectly fine.
    const { session, client, mesh, remote, events, local, kv } = setup();
    await session.joinRoom('RM0001', 'Bea');
    client.connect();
    client.frame(roomFrame({ isLeader: false, yourPeerId: 'me', peers: [{ peerId: 'me', name: 'Bea' }, { peerId: 'p2', name: 'Ana' }] }));
    await session.setCamera(true);

    for (let i = 0; i < 40; i++) {
      client.frame({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' });
      await vi.advanceTimersByTimeAsync(3000);
    }
    expect(client.rejoins).toHaveLength(40);
    expect(session.snapshot.room).not.toBeNull(); // still trying, still in the room

    client.frame({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' });
    await vi.advanceTimersByTimeAsync(3000);
    expect(client.rejoins).toHaveLength(40); // no forty-first
    expect(session.snapshot).toMatchObject({ room: null, peers: [], isLeader: false, joining: false, camOn: false });
    expect(session.snapshot.lastError).toEqual({ code: 'ROOM_GONE', message: expect.stringContaining('gone') });
    expect(session.mesh).toBeNull();
    expect(mesh.removedAll).toBe(1);
    expect(remote.detach).toHaveBeenCalledWith('p2');
    expect(events.videoRemoved).toHaveBeenCalledWith('p2');
    expect(local.local.micStream).toBeNull();
    expect(local.local.camStream).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(kv.store.session.gjDesiredRoom).toBeNull();
  });

  it('ends the room once PEER_ID_TAKEN retries run out', async () => {
    const { session, client } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame({ isLeader: true }));
    for (let i = 0; i < 10; i++) {
      client.frame({ type: 'error', code: 'PEER_ID_TAKEN', message: 'x' });
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(client.rejoins).toHaveLength(10);
    client.frame({ type: 'error', code: 'PEER_ID_TAKEN', message: 'still there' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.rejoins).toHaveLength(10);
    expect(session.snapshot.room).toBeNull();
    expect(session.snapshot.lastError).toEqual({ code: 'PEER_ID_TAKEN', message: 'still there' });
  });

  it('a room that ends leaves the lobby ready for the next one', async () => {
    const { session, client, local } = setup();
    await session.joinRoom('RM0001', 'Bea');
    client.connect();
    client.frame(roomFrame({ isLeader: false, yourPeerId: 'me' }));
    for (let i = 0; i <= 40; i++) {
      client.frame({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' });
      await vi.advanceTimersByTimeAsync(3000);
    }
    expect(session.snapshot.lastError?.code).toBe('ROOM_GONE');

    await session.createRoom('Bea');
    expect(session.snapshot).toMatchObject({ joining: true, lastError: null });
    expect(local.local.micStream).not.toBeNull(); // the mesh and the mic were rebuilt
    expect(session.mesh).not.toBeNull();
  });

  it('boot rejoins the room a previous offscreen document was in, keeping the peer id and counting the recreation', async () => {
    const storage = kv();
    storage.store.session = { gjDesiredRoom: { code: 'RM0009', peerId: 'old-id', name: 'Ana' }, gjReconnects: 2 };
    storage.store.local = { ducking: true };
    const { session, client, events } = setup({ kvStore: storage });
    await session.boot();
    expect(client.joins).toEqual([{ code: 'RM0009', peerId: 'old-id', name: 'Ana', create: false }]);
    expect(session.snapshot.socketReconnects).toBe(3);
    session.onSpeaking(true);
    expect(events.duck).toHaveBeenCalledWith(true); // ducking preference restored
    const fresh = setup();
    await fresh.session.boot();
    expect(fresh.client.joins).toEqual([]);
  });

  it('leave tears everything down, releases the devices, and forgets the room', async () => {
    const { session, client, mesh, remote, events, kv, local } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame({ peers: [{ peerId: 'me', name: 'Ana' }, { peerId: 'p2', name: 'Bea' }] }));
    await session.setCamera(true);
    expect(local.local.micStream).not.toBeNull();
    expect(local.local.camStream).not.toBeNull();
    session.leaveRoom();
    expect(local.local.micStream).toBeNull();
    expect(local.local.camStream).toBeNull();
    expect(session.snapshot.camOn).toBe(false);
    expect(session.snapshot.micOn).toBe(true); // the preference survives; the device is re-acquired on the next join
    expect(client.leaves).toBe(1);
    expect(mesh.removedAll).toBe(1);
    expect(session.mesh).toBeNull();
    expect(remote.detach).toHaveBeenCalledWith('p2');
    expect(events.videoRemoved).toHaveBeenCalledWith('me');
    expect(session.snapshot).toMatchObject({ room: null, peers: [], isLeader: false, joining: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(kv.store.session.gjDesiredRoom).toBeNull();
    client.frame({ type: 'error', code: 'ROOM_NOT_FOUND', message: 'x' });
    expect(client.rejoins).toEqual([]); // lastRoom was cleared
  });

  it('an unreachable server is reported with the URL', async () => {
    const { session, client } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.fail('ws://default');
    expect(session.snapshot.lastError).toEqual({ code: 'SERVER_UNREACHABLE', message: expect.stringContaining('ws://default') });
  });

  it('announces mic/camera over the wire and mirrors what peers report, including late-join state', async () => {
    const { session, client } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame({ peers: [{ peerId: 'me', name: 'Ana' }, { peerId: 'p2', name: 'Bea', media: { micOn: false, camOn: true } }] }));
    expect(client.sent.filter((m) => m.type === 'media')).toEqual([{ type: 'media', micOn: true, camOn: false }]);
    expect(session.snapshot.peerMedia.p2).toMatchObject({ micOn: false, camOn: true, speaking: false });
    session.setMic(false);
    expect(client.sent.at(-1)).toEqual({ type: 'media', micOn: false, camOn: false });
    client.frame({ type: 'media', from: 'p2', micOn: true, camOn: false });
    expect(session.snapshot.peerMedia.p2).toMatchObject({ micOn: true, camOn: false });
    client.frame({ type: 'peerJoined', peerId: 'p3', name: 'Cy' });
    expect(session.snapshot.peerMedia.p3).toMatchObject({ micOn: null, camOn: null }); // not told yet
  });

  it('tracks speaking for ourselves and for peers without touching ducking', async () => {
    const { session, client, events } = setup();
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame({ peers: [{ peerId: 'me', name: 'Ana' }, { peerId: 'p2', name: 'Bea' }] }));
    session.onSpeaking(true);
    expect(session.snapshot.speaking).toBe(true);
    expect(events.duck).not.toHaveBeenCalled();
    session.onPeerSpeaking('p2', true);
    expect(session.snapshot.peerMedia.p2?.speaking).toBe(true);
    session.onPeerSpeaking('p2', true); // no change, no extra broadcast
    const n = events.snapshot.mock.calls.length;
    session.onPeerSpeaking('p2', false);
    expect(session.snapshot.peerMedia.p2?.speaking).toBe(false);
    expect(events.snapshot.mock.calls.length).toBe(n + 1);
    client.frame({ type: 'peerLeft', peerId: 'p2', leaderId: 'me' });
    session.onPeerSpeaking('p2', true); // gone: ignored
    expect(session.snapshot.peerMedia.p2).toBeUndefined();
  });

  it('probes the server: checking, then reachable or unreachable; the live socket short-circuits it', async () => {
    const { session, client, probe } = setup();
    await session.boot();
    expect(session.snapshot.server).toMatchObject({ url: 'ws://default', host: 'default', state: 'unknown' });
    const p = session.probeServer();
    expect(session.snapshot.server.state).toBe('checking');
    await p;
    expect(session.snapshot.server).toMatchObject({ state: 'reachable', rttMs: 12 });
    probe.mockResolvedValueOnce({ ok: false, rttMs: null });
    await session.setServerUrl('wss://house.example');
    expect(session.snapshot.server).toMatchObject({ url: 'wss://house.example', host: 'house.example', state: 'unreachable' });
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    expect(session.snapshot.server.state).toBe('reachable'); // the socket opened
    client.frame(roomFrame());
    probe.mockClear();
    await session.probeServer();
    expect(probe).not.toHaveBeenCalled(); // in a room on that server: no need to probe
    client.fail('wss://house.example');
    expect(session.snapshot.server.state).toBe('unreachable');
  });

  it('a new mesh sends an already-open camera, not only the mic', async () => {
    const ok = fakeLocal();
    const { session, client, mesh } = setup({ local: ok });
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame());
    await session.setCamera(true);
    expect(mesh.video).toBe(ok.camTrack);
    // The room vanishes and is re-created: the session leaves the old mesh behind and builds a new one on rejoin.
    session.leaveRoom(); // the old mesh is discarded, the camera closed
    // Now the other way round: camera on while a mesh exists, then a fresh mesh for a new join must carry it.
    await session.joinRoom('RM0001', 'Ana');
    client.connect();
    client.frame(roomFrame());
    await session.setCamera(true);
    (session as any).mesh = null; // simulate any path that drops the mesh without leaving
    await (session as any).startMesh('me');
    expect(mesh.video).toBe(ok.camTrack);
  });
});
