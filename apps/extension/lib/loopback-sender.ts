/**
 * Offscreen side of the page loopback. Media cannot cross extension contexts,
 * so remote (and self) camera tracks are re-sent into one player page over a
 * local RTCPeerConnection. One sender per player port; it dies with the port.
 * Signaling rides the port itself. This side is impolite and drives offers.
 */
import type { PeerId } from '@gaj/shared';
import { PerfectPeer, type SignalPayload } from './perfect-peer';

export type LoopbackTrackInfo = { peerId: PeerId; name: string; streamId: string };
type Entry = { sender: RTCRtpSender; name: string; streamId: string };

export class LoopbackSender {
  private readonly pp: PerfectPeer;
  private readonly entries = new Map<PeerId, Entry>();

  constructor(
    private readonly signal: (payload: SignalPayload) => void,
    private readonly onTracks: (tracks: LoopbackTrackInfo[]) => void,
  ) {
    this.pp = new PerfectPeer(false, signal, { iceServers: [] });
  }

  get pc() { return this.pp.pc; }
  has(peerId: PeerId) { return this.entries.has(peerId); }
  get peerIds(): PeerId[] { return [...this.entries.keys()]; }

  /** Send `track` as `peerId`'s video; a second call for the same peer swaps the track in place. */
  add(peerId: PeerId, name: string, track: MediaStreamTrack, stream: MediaStream) {
    const existing = this.entries.get(peerId);
    if (existing) { void existing.sender.replaceTrack(track); return; }
    this.entries.set(peerId, { sender: this.pp.pc.addTrack(track, stream), name, streamId: stream.id });
    this.announce();
  }

  remove(peerId: PeerId) {
    const e = this.entries.get(peerId);
    if (!e) return;
    try { this.pp.pc.removeTrack(e.sender); } catch { /* closed */ }
    this.entries.delete(peerId);
    this.announce();
  }

  handle(payload: SignalPayload) { return this.pp.handle(payload); }

  close() { this.pp.close(); this.entries.clear(); }

  /** Tell the page which stream belongs to whom; stream ids are all it can see on `ontrack`. */
  private announce() {
    this.onTracks([...this.entries].map(([peerId, e]) => ({ peerId, name: e.name, streamId: e.streamId })));
  }
}
