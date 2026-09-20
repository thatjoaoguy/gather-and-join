/**
 * The room as this client sees it: one Snapshot, the join/rejoin state machine,
 * the mesh wiring, media toggles, and persistence of the desired room. Owns
 * every piece of room state that used to be a module-level variable in the
 * offscreen document. Transport, mesh, media and storage are injected so the
 * whole thing runs under vitest with fakes.
 *
 * Outputs are events: a snapshot for the UIs, playback/navigate frames for the
 * player, duck for the ducker, and video for whoever re-streams camera tracks
 * into pages (the loopback senders).
 */
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, type C2S, type MediaFlags, type PeerId, type S2C } from '@gj/shared';
import type { PeerMediaState, ServerStatus, Snapshot } from './messages';
import type { SignalPayload } from './perfect-peer';
import type { DesiredRoom, SocketStatus } from './room-client';
import type { Sabotage } from './constants';

// ---- injected collaborators ----------------------------------------------------

export type SessionClient = {
  url: string;
  readonly status: SocketStatus;
  readonly offsetMs: number;
  readonly reconnects: number;
  join(desired: DesiredRoom): void;
  rejoin(create?: boolean): void;
  leave(): void;
  send(msg: C2S): void;
  syncClock(): Promise<void>;
  dropForTest(): void;
};
export type ClientHandlers = { onFrame(msg: S2C): void; onStatus(status: SocketStatus): void; onConnectFailed(url: string): void };

export type SessionMeshPeer = { pp: { pc: RTCPeerConnection }; stream: MediaStream | null };
export type SessionMesh = {
  readonly peers: ReadonlyMap<PeerId, SessionMeshPeer>;
  add(peerId: PeerId): void;
  remove(peerId: PeerId): void;
  removeAll(): void;
  handleSignal(from: PeerId, payload: SignalPayload): void;
  setAudioTrack(track: MediaStreamTrack | null): void;
  setVideoTrack(track: MediaStreamTrack | null): void;
};
export type MeshHandlers = {
  sendSignal(to: PeerId, payload: SignalPayload): void;
  onTrack(peerId: PeerId, stream: MediaStream, track: MediaStreamTrack): void;
  onStateChange(peerId: PeerId): void;
};

export type SessionLocalMedia = {
  readonly micStream: MediaStream | null;
  readonly camStream: MediaStream | null;
  readonly micPermission: Snapshot['micPermission'];
  readonly camPermission: Snapshot['camPermission'];
  ensureMic(): Promise<MediaStreamTrack | null>;
  ensureCamera(): Promise<MediaStreamTrack | null>;
  stopCamera(): void;
  stopMic(): void;
};
export type SessionRemoteMedia = { attach(peerId: PeerId, stream: MediaStream): void; detach(peerId: PeerId): void };
export type SessionKv = {
  get(area: 'local' | 'session', keys: string[] | null): Promise<Record<string, unknown>>;
  set(area: 'local' | 'session', data: Record<string, unknown>): Promise<void>;
};
export type TestConfig = { sabotage: Sabotage; testPeerId: string | null; serverUrl: string | null; iceServers: RTCIceServer[] | null };

/** Reachability probe: open a socket to `url`, exchange one ping, close. Rejects or resolves ok:false when unreachable. */
export type ServerProbe = (url: string) => Promise<{ ok: boolean; rttMs: number | null }>;

export type SessionDeps = {
  createClient(url: string, handlers: ClientHandlers): SessionClient;
  probe: ServerProbe;
  createMesh(myId: PeerId, handlers: MeshHandlers, opts?: { iceServers?: RTCIceServer[] }): SessionMesh;
  local: SessionLocalMedia;
  remote: SessionRemoteMedia;
  kv: SessionKv;
  readTestConfig(): Promise<TestConfig>;
  defaultServerUrl: string;
  now?: () => number;
  newPeerId?: () => string;
  newRoomCode?: () => string;
};

export type PlaybackEvent = { paused: boolean; positionMs: number; serverTime: number; originPeerId: PeerId; offsetMs: number };
export type NavigateEvent = { contentId: string; watchUrl: string | null; originPeerId: PeerId };
export type VideoEvent = { peerId: PeerId; name: string; track: MediaStreamTrack; stream: MediaStream };

export type SessionEvents = {
  snapshot(s: Snapshot): void;
  playback(e: PlaybackEvent): void;
  navigate(e: NavigateEvent): void;
  duck(ducked: boolean): void;
  /** A camera track (remote, or our own for self-view) became live for a peer. */
  videoAdded(e: VideoEvent): void;
  /** That peer's camera is gone (track ended/muted, peer left, or our camera turned off). */
  videoRemoved(peerId: PeerId): void;
};

export type Content = { contentId: string | null; url: string };

const REJOIN_TAKEN_MS = 2000;
const REJOIN_NOT_FOUND_MS = 3000;
const MAX_TAKEN_RETRIES = 10;
const MAX_NOT_FOUND_RETRIES = 40;
const CREATE_RETRIES = 5;

export class RoomSession {
  readonly snapshot: Snapshot;
  mesh: SessionMesh | null = null;
  private readonly client: SessionClient;
  private desiredName = 'peer';
  private _content: Content = { contentId: null, url: '' };
  private duckingEnabled = false;
  private _ducked = false;
  private bootReconnects = 0;
  private pendingCreate = 0;
  /** What we were part of before a drop, so an automatic rejoin can be smart about errors. */
  private lastRoom: { code: string; wasLeader: boolean } | null = null;
  private rejoinAttempts = 0;
  private readonly connectedOnce = new Set<PeerId>();
  private readonly speakingPeers = new Set<PeerId>();
  private readonly peerFlags = new Map<PeerId, MediaFlags>();
  private probeSeq = 0;
  private readonly now: () => number;
  private readonly newPeerId: () => string;
  private readonly newRoomCode: () => string;

  constructor(private readonly deps: SessionDeps, private readonly events: SessionEvents) {
    this.now = deps.now ?? (() => Date.now());
    this.newPeerId = deps.newPeerId ?? (() => crypto.randomUUID().slice(0, 8));
    this.newRoomCode = deps.newRoomCode ?? generateRoomCode;
    this.snapshot = {
      serverUrl: deps.defaultServerUrl, socket: 'disconnected', joining: false, socketReconnects: 0, offsetMs: 0,
      room: null, peers: [], yourPeerId: null, isLeader: false, micOn: true, camOn: false, speaking: false,
      server: serverStatus(deps.defaultServerUrl), micPermission: 'unknown', camPermission: 'unknown',
      stalledBy: null, peerMedia: {}, lastError: null,
    };
    this.client = deps.createClient(deps.defaultServerUrl, {
      onFrame: (m) => this.onFrame(m),
      onStatus: (s) => this.onStatus(s),
      onConnectFailed: (url) => {
        this.snapshot.server = { ...serverStatus(url), state: 'unreachable', checkedAt: this.now() };
        this.fail('SERVER_UNREACHABLE', `Can't reach the server at ${url}. Check the server URL on the setup page.`);
      },
    });
  }

  get ducked() { return this._ducked; }
  get offsetMs() { return this.client.offsetMs; }
  get content() { return this._content; }
  peerName(peerId: PeerId): string {
    if (peerId === this.snapshot.yourPeerId) return 'You';
    return this.snapshot.peers.find((p) => p.peerId === peerId)?.name ?? peerId;
  }

  // ---- snapshot ----------------------------------------------------------------

  /** Mutate the snapshot and tell everyone. Every state change goes through here. */
  private patch(changes: Partial<Snapshot>) {
    Object.assign(this.snapshot, changes);
    this.broadcast();
  }
  private broadcast() {
    this.snapshot.offsetMs = this.client.offsetMs;
    this.events.snapshot(this.snapshot);
  }
  private fail(code: string, message: string) {
    this.patch({ lastError: { code, message } });
  }
  private refreshPeerMedia() {
    const peerMedia: Record<PeerId, PeerMediaState> = {};
    for (const p of this.snapshot.peers) {
      const e = this.mesh?.peers.get(p.peerId);
      if (!e) continue;
      const flags = this.peerFlags.get(p.peerId);
      peerMedia[p.peerId] = {
        connectionState: e.pp.pc.connectionState, iceConnectionState: e.pp.pc.iceConnectionState, signalingState: e.pp.pc.signalingState,
        hasAudio: !!e.stream?.getAudioTracks().some((t) => t.readyState === 'live'),
        hasVideo: !!e.stream?.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted),
        speaking: this.speakingPeers.has(p.peerId),
        micOn: flags?.micOn ?? null,
        camOn: flags?.camOn ?? null,
      };
    }
    this.snapshot.peerMedia = peerMedia;
  }
  private async persist() {
    const s = this.snapshot;
    const desired = s.room ? { code: s.room.code, peerId: s.yourPeerId, name: this.desiredName } : null;
    await this.deps.kv.set('session', { gjDesiredRoom: desired, gjReconnects: s.socketReconnects });
  }

  // ---- boot ----------------------------------------------------------------------

  /** If a previous offscreen document was in a room, rejoin it. */
  async boot() {
    const [prefs, s] = await Promise.all([this.deps.kv.get('local', ['ducking', 'serverUrl']), this.deps.kv.get('session', ['gjDesiredRoom', 'gjReconnects'])]);
    this.duckingEnabled = prefs.ducking === true;
    const cfg = await this.deps.readTestConfig();
    this.snapshot.server = serverStatus(cfg.serverUrl ?? (prefs.serverUrl as string | undefined) ?? this.deps.defaultServerUrl);
    const desired = s.gjDesiredRoom as { code: string; peerId: string; name: string } | null | undefined;
    if (!desired) return;
    this.bootReconnects = ((s.gjReconnects as number) ?? 0) + 1;
    this.snapshot.socketReconnects = this.bootReconnects;
    this.snapshot.yourPeerId = desired.peerId;
    await this.join(desired.code, desired.name, false);
  }

  // ---- room lifecycle ------------------------------------------------------------

  async createRoom(name: string, fixedCode?: string) {
    this.pendingCreate = fixedCode ? 0 : CREATE_RETRIES;
    await this.join(fixedCode ?? this.newRoomCode(), name, true);
  }

  async joinRoom(code: string, name: string) {
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) { this.fail('BAD_CODE', 'Room codes are 6 letters/digits.'); return; }
    await this.join(normalized, name, false);
  }

  private async join(code: string, name: string, create: boolean) {
    const cfg = await this.deps.readTestConfig();
    const stored = await this.deps.kv.get('local', ['ducking']);
    this.duckingEnabled = stored.ducking === true;
    this.client.url = await this.configuredServerUrl();
    this.desiredName = name;
    const peerId = cfg.testPeerId ?? this.snapshot.yourPeerId ?? this.newPeerId();
    if (this.snapshot.server.url !== this.client.url) this.snapshot.server = serverStatus(this.client.url);
    this.patch({ serverUrl: this.client.url, yourPeerId: peerId, lastError: null, joining: true });
    this.client.join({ code, peerId, name, create });
    await this.startMesh(peerId, cfg.iceServers ?? undefined); // mic acquisition may be slow or denied; the join must not wait on it
    this.broadcast();
  }

  private async startMesh(peerId: PeerId, iceServers?: RTCIceServer[]) {
    if (this.mesh) return;
    const mesh = this.mesh = this.deps.createMesh(peerId, {
      sendSignal: (to, payload) => this.client.send({ type: 'signal', to, payload }),
      onTrack: (from, stream, track) => this.onRemoteTrack(from, stream, track),
      onStateChange: (id) => {
        const e = this.mesh?.peers.get(id);
        if (e?.pp.pc.connectionState === 'connected' && !this.connectedOnce.has(id)) {
          this.connectedOnce.add(id);
          void this.client.syncClock().then(() => this.broadcast());
        }
        this.refreshPeerMedia();
        this.broadcast();
      },
    }, iceServers ? { iceServers } : undefined);
    for (const p of this.snapshot.peers) if (p.peerId !== peerId) mesh.add(p.peerId);
    // A camera that is already open (camera on, then a new mesh) must be sent too, not only the mic.
    const cam = this.snapshot.camOn ? this.deps.local.camStream?.getVideoTracks()[0] : undefined;
    if (cam) mesh.setVideoTrack(cam);
    const micTrack = await this.deps.local.ensureMic();
    this.snapshot.micPermission = this.deps.local.micPermission;
    if (micTrack) { micTrack.enabled = this.snapshot.micOn; mesh.setAudioTrack(micTrack); }
  }

  private onRemoteTrack(from: PeerId, stream: MediaStream, track: MediaStreamTrack) {
    this.deps.remote.attach(from, stream);
    if (track.kind === 'video') {
      const name = () => this.peerName(from);
      this.events.videoAdded({ peerId: from, name: name(), track, stream });
      // A camera turned off on the far side removes the sender; our receiver track mutes rather than ends.
      const gone = () => { this.events.videoRemoved(from); this.refreshPeerMedia(); this.broadcast(); };
      const back = () => { this.events.videoAdded({ peerId: from, name: name(), track, stream }); this.refreshPeerMedia(); this.broadcast(); };
      track.addEventListener('ended', gone);
      track.addEventListener('mute', gone);
      track.addEventListener('unmute', back);
    }
    this.refreshPeerMedia();
    this.broadcast();
  }

  leaveRoom() {
    this.teardown();
    this.patch({ lastError: null });
  }

  /**
   * Put this client back in the lobby: drop the socket, the mesh and the devices, and
   * empty every trace of the room from the snapshot. `lastError` is left alone so a
   * teardown forced by the server can explain itself on the lobby screen.
   */
  private teardown() {
    this.lastRoom = null;
    this.rejoinAttempts = 0;
    this.pendingCreate = 0;
    this.client.leave();
    this.mesh?.removeAll();
    this.mesh = null;
    this.connectedOnce.clear();
    for (const p of this.snapshot.peers) { this.deps.remote.detach(p.peerId); this.events.videoRemoved(p.peerId); }
    if (this.snapshot.yourPeerId) this.events.videoRemoved(this.snapshot.yourPeerId);
    this.speakingPeers.clear();
    this.peerFlags.clear();
    // Release the devices so Chrome's indicators go off; the next join re-acquires them.
    this.deps.local.stopCamera();
    this.deps.local.stopMic();
    this.patch({ joining: false, room: null, peers: [], isLeader: false, stalledBy: null, peerMedia: {}, camOn: false, speaking: false });
    void this.persist();
  }

  // ---- content -------------------------------------------------------------------

  /** The page (or the service worker's navigation watcher) reports where this client is. */
  setContent(content: Content) {
    this._content = content;
    this.announceContent();
  }

  private announceContent() {
    const { room, isLeader } = this.snapshot;
    if (!room || this.client.status !== 'connected') return;
    const { contentId, url } = this._content;
    if (!contentId) return;
    if (room.contentId === null) this.client.send({ type: 'hello', contentId, watchUrl: url });
    else if (isLeader && room.contentId !== contentId) this.client.send({ type: 'navigate', contentId, watchUrl: url });
  }

  navigateRequest(contentId: string, url: string) {
    this.client.send({ type: 'navigate', contentId, watchUrl: url });
  }

  // ---- playback ------------------------------------------------------------------

  playback(paused: boolean, positionMs: number) {
    this.client.send({ type: 'playback', paused, positionMs, clientTime: this.now() });
  }

  stalled() {
    this.client.send({ type: 'playback', paused: true, positionMs: this.snapshot.room?.positionMs ?? 0, clientTime: this.now(), reason: 'stall' });
  }

  // ---- media ---------------------------------------------------------------------

  setMic(on: boolean) {
    const t = this.deps.local.micStream?.getAudioTracks()[0];
    if (t) t.enabled = on;
    this.snapshot.micOn = on;
    this.announceMedia();
    this.broadcast();
  }

  /** Tell the room our mic/camera state, so their tiles can show it. */
  private announceMedia() {
    if (!this.snapshot.room || this.client.status !== 'connected') return;
    this.client.send({ type: 'media', micOn: this.snapshot.micOn, camOn: this.snapshot.camOn });
  }

  async setCamera(on: boolean) {
    if (on === this.snapshot.camOn) return;
    this.snapshot.camOn = on;
    if (on) {
      const track = await this.deps.local.ensureCamera();
      this.snapshot.camPermission = this.deps.local.camPermission;
      if (!track) {
        this.snapshot.camOn = false;
        this.fail(
          this.deps.local.camPermission === 'denied' ? 'CAMERA_NOT_ALLOWED' : 'CAMERA_UNAVAILABLE',
          this.deps.local.camPermission === 'denied' ? 'Camera not allowed yet — allow it on the setup page.' : 'No camera available.',
        );
        return;
      }
      this.snapshot.lastError = null;
      this.mesh?.setVideoTrack(track);
      this.announceMedia();
      // Self-view: pages get our own camera over the loopback too.
      const stream = this.deps.local.camStream;
      if (this.snapshot.yourPeerId && stream) this.events.videoAdded({ peerId: this.snapshot.yourPeerId, name: 'You', track, stream });
    } else {
      this.mesh?.setVideoTrack(null);
      if (this.snapshot.yourPeerId) this.events.videoRemoved(this.snapshot.yourPeerId);
      this.deps.local.stopCamera();
      this.announceMedia();
    }
    this.broadcast();
  }

  // ---- server address ------------------------------------------------------------

  /** The setup page or popup saved a new address. Applies to the next join; probed at once. */
  async setServerUrl(url: string) {
    await this.deps.kv.set('local', { serverUrl: url });
    this.snapshot.server = serverStatus(url);
    this.broadcast();
    await this.probeServer();
  }

  /** The address to use for the next join: the test config, then the saved setting, then the default. */
  private async configuredServerUrl(): Promise<string> {
    const cfg = await this.deps.readTestConfig();
    const stored = await this.deps.kv.get('local', ['serverUrl']);
    return cfg.serverUrl ?? (stored.serverUrl as string | undefined) ?? this.deps.defaultServerUrl;
  }

  /** Connect, ping once, close: is the configured server there? Skipped while our own socket already answers. */
  async probeServer() {
    const seq = ++this.probeSeq;
    this.snapshot.server = { ...this.snapshot.server, state: 'checking' };
    this.broadcast();
    const url = await this.configuredServerUrl();
    if (seq !== this.probeSeq) return; // superseded while resolving
    if (this.snapshot.server.url !== url) { this.snapshot.server = { ...serverStatus(url), state: 'checking' }; this.broadcast(); }
    if (this.snapshot.room && this.client.status === 'connected' && this.client.url === url) {
      this.snapshot.server = { ...this.snapshot.server, state: 'reachable', rttMs: null, checkedAt: this.now() };
      this.broadcast();
      return;
    }
    let result: { ok: boolean; rttMs: number | null };
    try { result = await this.deps.probe(url); } catch { result = { ok: false, rttMs: null }; }
    if (seq !== this.probeSeq || this.snapshot.server.url !== url) return; // superseded
    this.snapshot.server = { ...this.snapshot.server, state: result.ok ? 'reachable' : 'unreachable', rttMs: result.rttMs, checkedAt: this.now() };
    this.broadcast();
  }

  /** The options page granted the mic after we tried and failed. */
  async micGranted() {
    const t = await this.deps.local.ensureMic();
    this.snapshot.micPermission = this.deps.local.micPermission;
    if (t) { t.enabled = this.snapshot.micOn; this.mesh?.setAudioTrack(t); }
    this.broadcast();
  }

  cameraGranted() {
    this.patch({ camPermission: 'granted', lastError: null });
  }

  /** Every camera currently live from this client's point of view, for a loopback that just opened. */
  liveVideos(): VideoEvent[] {
    const out: VideoEvent[] = [];
    for (const [peerId, e] of this.mesh?.peers ?? []) {
      const track = e.stream?.getVideoTracks().find((t) => t.readyState === 'live' && !t.muted);
      if (track && e.stream) out.push({ peerId, name: this.peerName(peerId), track, stream: e.stream });
    }
    const self = this.deps.local.camStream;
    const selfTrack = self?.getVideoTracks()[0];
    if (self && selfTrack && this.snapshot.yourPeerId) out.push({ peerId: this.snapshot.yourPeerId, name: 'You', track: selfTrack, stream: self });
    return out;
  }

  // ---- ducking -------------------------------------------------------------------

  setDucking(enabled: boolean) {
    this.duckingEnabled = enabled;
    if (!enabled && this._ducked) { this._ducked = false; this.events.duck(false); }
  }

  /** From the local speech detector. Always reflected in the snapshot; ducking only when enabled. */
  onSpeaking(speaking: boolean) {
    if (speaking !== this.snapshot.speaking) { this.snapshot.speaking = speaking; this.broadcast(); }
    if (!this.duckingEnabled) return;
    this._ducked = speaking;
    this.events.duck(speaking);
  }

  /** From the remote audio analyser. */
  onPeerSpeaking(peerId: PeerId, speaking: boolean) {
    if (speaking === this.speakingPeers.has(peerId)) return;
    if (speaking) this.speakingPeers.add(peerId); else this.speakingPeers.delete(peerId);
    const m = this.snapshot.peerMedia[peerId];
    if (m) { m.speaking = speaking; this.broadcast(); }
  }

  // ---- test seams ----------------------------------------------------------------

  dropSocketForTest() { this.client.dropForTest(); }

  // ---- transport callbacks -------------------------------------------------------

  private onStatus(status: SocketStatus) {
    const s = this.snapshot;
    s.socket = status;
    if (status !== 'connected' && s.room) s.lastError = { code: 'RECONNECTING', message: 'Connection lost — reconnecting…' };
    if (status === 'connected' && s.lastError?.code === 'RECONNECTING') s.lastError = null;
    if (status === 'connected') s.server = { ...serverStatus(this.client.url), state: 'reachable', rttMs: null, checkedAt: this.now() };
    s.socketReconnects = this.client.reconnects + this.bootReconnects;
    void this.persist();
    this.broadcast();
  }

  private onFrame(msg: S2C) {
    const s = this.snapshot;
    switch (msg.type) {
      case 'room': {
        this.rejoinAttempts = 0;
        this.lastRoom = { code: msg.state.code, wasLeader: msg.isLeader };
        for (const p of msg.peers) if (p.media) this.peerFlags.set(p.peerId, p.media);
        this.patch({ joining: false, room: msg.state, peers: msg.peers, yourPeerId: msg.yourPeerId, isLeader: msg.isLeader, lastError: null });
        for (const p of msg.peers) if (p.peerId !== msg.yourPeerId) this.mesh?.add(p.peerId);
        this.refreshPeerMedia();
        void this.persist();
        this.announceMedia();
        this.announceContent();
        return;
      }
      case 'peerJoined':
        this.mesh?.add(msg.peerId);
        s.peers = [...s.peers.filter((p) => p.peerId !== msg.peerId), { peerId: msg.peerId, name: msg.name }];
        this.refreshPeerMedia();
        this.broadcast();
        return;
      case 'peerLeft': {
        if (msg.peerId === s.yourPeerId) return; // our own stale socket being evicted on rejoin
        this.mesh?.remove(msg.peerId);
        this.deps.remote.detach(msg.peerId);
        this.events.videoRemoved(msg.peerId);
        this.connectedOnce.delete(msg.peerId);
        this.speakingPeers.delete(msg.peerId);
        this.peerFlags.delete(msg.peerId);
        const changes: Partial<Snapshot> = { peers: s.peers.filter((p) => p.peerId !== msg.peerId) };
        if (s.stalledBy?.peerId === msg.peerId) changes.stalledBy = null;
        if (s.room) { changes.room = { ...s.room, leaderId: msg.leaderId }; changes.isLeader = msg.leaderId === s.yourPeerId; }
        Object.assign(s, changes);
        this.refreshPeerMedia();
        this.broadcast();
        return;
      }
      case 'leader':
        if (s.room) { s.room = { ...s.room, leaderId: msg.leaderId }; s.isLeader = msg.leaderId === s.yourPeerId; }
        if (this.lastRoom) this.lastRoom.wasLeader = s.isLeader;
        this.broadcast();
        return;
      case 'playback': {
        if (s.room) s.room = { ...s.room, paused: msg.paused, positionMs: msg.positionMs, updatedAt: msg.serverTime };
        if (msg.reason === 'stall') s.stalledBy = { peerId: msg.originPeerId, name: msg.originPeerId === s.yourPeerId ? 'you' : this.peerName(msg.originPeerId) };
        else if (!msg.paused) s.stalledBy = null;
        this.events.playback({ paused: msg.paused, positionMs: msg.positionMs, serverTime: msg.serverTime, originPeerId: msg.originPeerId, offsetMs: this.client.offsetMs });
        this.broadcast();
        return;
      }
      case 'navigate':
        if (s.room) s.room = { ...s.room, contentId: msg.contentId, watchUrl: msg.watchUrl, positionMs: 0, paused: true, updatedAt: this.now() + this.client.offsetMs };
        this.events.navigate({ contentId: msg.contentId, watchUrl: msg.watchUrl, originPeerId: msg.originPeerId });
        this.broadcast();
        return;
      case 'media':
        this.peerFlags.set(msg.from, { micOn: msg.micOn, camOn: msg.camOn });
        this.refreshPeerMedia();
        this.broadcast();
        return;
      case 'signal':
        this.mesh?.handleSignal(msg.from, msg.payload as SignalPayload);
        return;
      case 'error':
        this.onError(msg.code, msg.message);
        return;
      case 'pong':
        return;
    }
  }

  private onError(code: string, message: string) {
    const s = this.snapshot;
    const wasInRoom = !!s.room;
    s.joining = false;
    s.lastError = { code, message };
    if (code === 'ROOM_EXISTS' && this.pendingCreate > 0) {
      this.pendingCreate--;
      void this.join(this.newRoomCode(), this.desiredName, true);
      return;
    }
    if (code === 'PEER_ID_TAKEN' && this.rejoinAttempts < MAX_TAKEN_RETRIES) {
      // Our previous socket is still registered (silent drop); the server evicts it on
      // the next join, and older servers time it out — either way, try again shortly.
      this.rejoinAttempts++;
      setTimeout(() => this.client.rejoin(), REJOIN_TAKEN_MS);
      return;
    }
    if (code === 'ROOM_NOT_FOUND' && this.lastRoom && this.rejoinAttempts < MAX_NOT_FOUND_RETRIES) {
      // The room vanished under us (server restarted). The leader re-creates it with
      // the same code; everyone else keeps trying to join it for a while.
      this.rejoinAttempts++;
      if (this.lastRoom.wasLeader) this.client.rejoin(true);
      else setTimeout(() => this.client.rejoin(), REJOIN_NOT_FOUND_MS);
      this.patch({ lastError: { code: 'RECONNECTING', message: 'Room lost — reconnecting…' } });
      return;
    }
    if (code === 'ROOM_NOT_FOUND' || code === 'PEER_ID_TAKEN' || code === 'ROOM_EXISTS') {
      // Out of retries. The socket goes, but the mesh does not drop itself: WebRTC needs
      // the server only to introduce peers, so audio and video keep flowing and the room
      // would sit there looking connected while no new peer could ever reach it. End it
      // properly and say why, instead of leaving a UI stuck on "Reconnecting…" forever.
      const gone = code === 'ROOM_NOT_FOUND' && wasInRoom;
      this.teardown();
      this.patch(gone
        ? { lastError: { code: 'ROOM_GONE', message: 'Your room is gone — the server lost it and it did not come back.' } }
        : { lastError: { code, message } });
      return;
    }
    this.broadcast();
  }
}

function serverStatus(url: string): ServerStatus {
  let host = url;
  try { host = new URL(url).host; } catch { /* keep the raw string */ }
  return { url, host, state: 'unknown', rttMs: null, checkedAt: null };
}
