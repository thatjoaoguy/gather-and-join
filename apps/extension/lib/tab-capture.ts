/**
 * Firefox's track source. A background page may not call getUserMedia, whatever the
 * permission says ("The request is not allowed by the user agent or the platform in
 * the current context"), but an extension tab may, and it inherits the grant made on
 * the setup page. So while you are in a room a pinned call tab captures, and sends the
 * tracks here over a local RTCPeerConnection: media cannot cross extension contexts
 * any other way.
 *
 * The tab offers once, with one audio and one video transceiver; capturing and
 * releasing are replaceTrack calls on its side, so nothing renegotiates. LocalMedia
 * gets a clone of the receiver track, since its stop() would otherwise end the
 * receiver for good.
 */
import type { CaptureKind, TrackSource } from './local-media';
import type { FromCallTab, ToCallTab } from './messages';
import type { SignalPayload } from './perfect-peer';

export type CallTabPort = {
  post(m: ToCallTab): void;
  onMessage(fn: (m: FromCallTab) => void): void;
  onDisconnect(fn: () => void): void;
  disconnect(): void;
};

/** The receiving end of the loopback: a polite PerfectPeer in production. */
export type LoopbackPeer = {
  readonly pc: Pick<RTCPeerConnection, 'ontrack'>;
  handle(payload: SignalPayload): unknown;
  close(): void;
};

export type TabCaptureDeps = {
  /** Open the pinned call tab, or reuse one; it connects back on PORT_CALL. */
  openTab(): Promise<void>;
  closeTab(): void;
  /** Only a room opens the tab: the setup page granting the mic must not. */
  inRoom(): boolean;
  createPeer(signal: (payload: SignalPayload) => void): LoopbackPeer;
  /** The tab went away while it held these. */
  onLost(kinds: CaptureKind[]): void;
};

/** Opening the tab, loading it and negotiating the loopback, on a busy machine. */
export const CALL_TAB_READY_MS = 15_000;
/** Long: if the grant was never made, Firefox is asking in the tab and someone has to answer. */
export const CALL_TAB_CAPTURE_MS = 60_000;

export class TabCapture implements TrackSource {
  private port: CallTabPort | null = null;
  private peer: LoopbackPeer | null = null;
  private readonly tracks = new Map<CaptureKind, MediaStreamTrack>();
  private readonly held = new Set<CaptureKind>();
  private readonly pending = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  private waiters = new Set<() => void>();
  private opening: Promise<void> | null = null;
  private seq = 0;

  constructor(
    private readonly deps: TabCaptureDeps,
    private readonly timeouts = { readyMs: CALL_TAB_READY_MS, captureMs: CALL_TAB_CAPTURE_MS },
  ) {}

  /** A call tab connected (the background page's runtime.onConnect on PORT_CALL). */
  attach(port: CallTabPort) {
    // A reloaded tab connects again; the old connection is dead weight.
    if (this.port) this.teardown();
    this.port = port;
    const peer = this.deps.createPeer((payload) => port.post({ type: 'signal', payload }));
    this.peer = peer;
    peer.pc.ontrack = (ev) => { this.tracks.set(ev.track.kind as CaptureKind, ev.track); this.wake(); };
    port.onMessage((m) => {
      if (m.type === 'signal') { if (this.port === port) void peer.handle(m.payload as SignalPayload); return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.ok) p.resolve(); else p.reject(new DOMException(m.message, m.error));
    });
    port.onDisconnect(() => { if (this.port === port) this.lost(); });
    this.wake();
  }

  async get(kind: CaptureKind, constraints: MediaTrackConstraints): Promise<MediaStream> {
    const track = await this.ready(kind);
    const id = ++this.seq;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new DOMException(`the call tab did not answer for the ${kind}`, 'AbortError')); }, this.timeouts.captureMs);
      this.pending.set(id, { resolve: () => { clearTimeout(timer); resolve(); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.port!.post({ type: 'capture', id, kind, constraints });
    });
    this.held.add(kind);
    return new MediaStream([track.clone()]);
  }

  release(kind: CaptureKind) {
    if (!this.held.delete(kind)) return;
    this.port?.post({ type: 'release', kind });
    // Nothing captured is nothing to keep a tab open for: that is leaving the room.
    if (this.held.size === 0) {
      const port = this.port;
      this.teardown();
      port?.disconnect();
      this.deps.closeTab();
    }
  }

  private async ready(kind: CaptureKind): Promise<MediaStreamTrack> {
    if (!this.port) {
      if (!this.deps.inRoom()) throw new DOMException('the call tab only opens in a room', 'InvalidStateError');
      this.opening ??= this.deps.openTab().finally(() => { this.opening = null; });
      await this.opening;
    }
    await this.until(() => this.tracks.has(kind), `the call tab's ${kind}`);
    return this.tracks.get(kind)!;
  }

  private until(cond: () => boolean, what: string): Promise<void> {
    if (cond()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const check = () => { if (cond()) { this.waiters.delete(check); clearTimeout(timer); resolve(); } };
      const timer = setTimeout(() => { this.waiters.delete(check); reject(new DOMException(`timed out waiting for ${what}`, 'AbortError')); }, this.timeouts.readyMs);
      this.waiters.add(check);
    });
  }

  private wake() { for (const w of [...this.waiters]) w(); }

  private lost() {
    const kinds = [...this.held];
    for (const p of this.pending.values()) p.reject(new DOMException('the call tab was closed', 'AbortError'));
    this.pending.clear();
    this.teardown();
    if (kinds.length) this.deps.onLost(kinds);
  }

  private teardown() {
    this.peer?.close();
    this.peer = null;
    this.port = null;
    this.tracks.clear();
    this.held.clear();
  }
}
