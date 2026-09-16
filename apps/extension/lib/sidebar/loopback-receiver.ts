/**
 * Page side of the loopback: receives the video tracks the offscreen document
 * re-sends and maps each incoming stream to the peer it belongs to. Polite side
 * of perfect negotiation; the offscreen side offers.
 */
import type { PeerId } from '@gaj/shared';
import type { LoopbackTrackInfo } from '../loopback-sender';
import { PerfectPeer, type SignalPayload } from '../perfect-peer';

export class LoopbackReceiver {
  private peer: PerfectPeer | null = null;
  private readonly streams = new Map<string, MediaStream>();
  private owners = new Map<string, LoopbackTrackInfo>();

  constructor(
    private readonly signal: (payload: SignalPayload) => void,
    /** Fired whenever the set of live streams or their owners changes. */
    private readonly onChange: () => void,
  ) {}

  get isOpen() { return this.peer !== null; }

  open() {
    if (this.peer) return;
    this.peer = new PerfectPeer(true, this.signal, { iceServers: [] });
    this.peer.pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream || ev.track.kind !== 'video') return;
      this.streams.set(stream.id, stream);
      const live = () => stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
      const drop = () => { if (!live()) { this.streams.delete(stream.id); this.onChange(); } };
      ev.track.addEventListener('ended', drop);
      ev.track.addEventListener('mute', drop);
      ev.track.addEventListener('unmute', () => { this.streams.set(stream.id, stream); this.onChange(); });
      stream.addEventListener('removetrack', drop);
      this.onChange();
    };
  }

  close() {
    this.peer?.close();
    this.peer = null;
    this.streams.clear();
    this.onChange();
  }

  handleSignal(payload: SignalPayload) {
    if (!this.peer) this.open();
    void this.peer!.handle(payload);
  }

  setTracks(tracks: LoopbackTrackInfo[]) {
    this.owners = new Map(tracks.map((t) => [t.streamId, t]));
    this.onChange();
  }

  /** The live stream showing `peerId`'s camera, or null. */
  streamFor(peerId: PeerId): MediaStream | null {
    for (const [id, owner] of this.owners) if (owner.peerId === peerId && this.streams.has(id)) return this.streams.get(id)!;
    return null;
  }
}
