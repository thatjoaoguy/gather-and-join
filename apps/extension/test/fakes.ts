/**
 * Node-side stand-ins for the browser objects the extension modules touch.
 * Just enough surface for the units under test; nothing here negotiates.
 */
import { vi } from 'vitest';

export type Listener = (ev?: unknown) => void;

export class FakeEventTarget {
  private listeners = new Map<string, Set<Listener>>();
  addEventListener(name: string, fn: Listener) { (this.listeners.get(name) ?? this.listeners.set(name, new Set()).get(name)!).add(fn); }
  removeEventListener(name: string, fn: Listener) { this.listeners.get(name)?.delete(fn); }
  emit(name: string, ev?: unknown) { for (const fn of [...(this.listeners.get(name) ?? [])]) fn(ev); }
}

export class FakeTrack extends FakeEventTarget {
  readyState: 'live' | 'ended' = 'live';
  muted = false;
  enabled = true;
  constructor(public readonly kind: 'audio' | 'video', public readonly id = `${kind}-${Math.random().toString(36).slice(2, 6)}`) { super(); }
  mute() { this.muted = true; this.emit('mute'); }
  unmute() { this.muted = false; this.emit('unmute'); }
  end() { this.readyState = 'ended'; this.emit('ended'); }
}

export class FakeStream extends FakeEventTarget {
  constructor(public readonly tracks: FakeTrack[], public readonly id = `s-${Math.random().toString(36).slice(2, 6)}`) { super(); }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
}

export class FakeSender {
  constructor(public track: FakeTrack) {}
  replaceTrack = vi.fn(async (t: FakeTrack) => { this.track = t; });
}

/** RTCPeerConnection with recorded calls; states are plain writable fields. */
export class FakePeerConnection extends FakeEventTarget {
  static instances: FakePeerConnection[] = [];
  connectionState = 'new';
  iceConnectionState = 'new';
  signalingState = 'stable';
  localDescription: { type: string; sdp: string; toJSON(): unknown } | null = null;
  senders: FakeSender[] = [];
  closed = false;
  ontrack: ((ev: unknown) => void) | null = null;
  onnegotiationneeded: (() => Promise<void> | void) | null = null;
  onicecandidate: ((ev: { candidate: unknown }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  remoteDescriptions: unknown[] = [];
  /** The live one, which is what tells a candidate whether it can be added yet. */
  remoteDescription: unknown = null;
  candidates: unknown[] = [];
  transceivers: { kind: string; direction: string }[] = [];
  restartIce = vi.fn();
  constructor(public readonly config: unknown) { super(); FakePeerConnection.instances.push(this); }
  addTransceiver(kind: string, init?: { direction?: string }) {
    const t = { kind, direction: init?.direction ?? 'sendrecv' };
    this.transceivers.push(t);
    return t as unknown as RTCRtpTransceiver;
  }
  addTrack(track: FakeTrack, _stream: FakeStream) { const s = new FakeSender(track); this.senders.push(s); return s as unknown as RTCRtpSender; }
  removeTrack(sender: RTCRtpSender) { this.senders = this.senders.filter((s) => s !== (sender as unknown as FakeSender)); }
  async setLocalDescription() { this.localDescription = { type: 'offer', sdp: 'x', toJSON() { return { type: this.type, sdp: this.sdp }; } }; }
  async setRemoteDescription(d: unknown) { this.remoteDescriptions.push(d); this.remoteDescription = d; }
  async addIceCandidate(c: unknown) {
    // Chrome throws here when no remote description is set, and the candidate is lost.
    if (!this.remoteDescription) throw new Error('InvalidStateError: remote description not set');
    this.candidates.push(c);
  }
  async getStats() { return new Map(); }
  close() { this.closed = true; }
  /** Simulate a remote track arriving. */
  receive(track: FakeTrack, stream: FakeStream) { this.ontrack?.({ track, streams: [stream] }); }
  setState(s: string) { this.connectionState = s; this.onconnectionstatechange?.(); this.emit('connectionstatechange'); }
  setIceState(s: string) { this.iceConnectionState = s; this.oniceconnectionstatechange?.(); this.emit('iceconnectionstatechange'); }
}

export function installFakeRtc() {
  FakePeerConnection.instances = [];
  (globalThis as any).RTCPeerConnection = FakePeerConnection;
  (globalThis as any).MediaStream = FakeStream;
}

/** WebSocket that never touches the network; the test opens, delivers and closes it by hand. */
export class FakeWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public readonly url: string) { FakeWebSocket.instances.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { if (this.readyState === FakeWebSocket.CLOSED) return; this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
  // test controls
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  deliver(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  /** Server-side drop: no leave frame, just a close. */
  drop() { this.close(); }
  /** Answer every outstanding ping with a pong, `rtt` ms later on the fake clock. */
  answerPings(serverTime: () => number) {
    for (const m of this.sent.splice(0)) if (m.type === 'ping') this.deliver({ type: 'pong', clientTime: m.clientTime, serverTime: serverTime() });
  }
  static latest() { return FakeWebSocket.instances.at(-1)!; }
}

export function installFakeWebSocket() {
  FakeWebSocket.instances = [];
  (globalThis as any).WebSocket = FakeWebSocket;
}
