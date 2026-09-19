/**
 * Full-mesh WebRTC. One PerfectPeer per remote peer, all living in the
 * offscreen document. The peer with the lexicographically lower peerId is the
 * impolite side (it ends up as the offerer); the higher id is polite.
 */
import type { PeerId } from '@gj/shared';
import { STUN_SERVERS } from './constants';
import { PerfectPeer, type SignalPayload } from './perfect-peer';

import { isObserver } from './peer-id';
export { isObserver };

export type MeshPeer = { pp: PerfectPeer; stream: MediaStream | null; videoSender: RTCRtpSender | null; audioSender: RTCRtpSender | null };

export class Mesh {
  readonly peers = new Map<PeerId, MeshPeer>();
  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private readonly localStream = new MediaStream();

  constructor(
    private readonly myId: PeerId,
    private readonly sendSignal: (to: PeerId, payload: SignalPayload) => void,
    private readonly onTrack: (peerId: PeerId, stream: MediaStream, track: MediaStreamTrack) => void,
    private readonly onStateChange: (peerId: PeerId) => void,
    /** Defaults to public STUN. Tests pass [] so ICE stays on host candidates. */
    private readonly iceServers: RTCIceServer[] = STUN_SERVERS,
  ) {}

  add(peerId: PeerId) {
    if (this.peers.has(peerId) || peerId === this.myId || isObserver(peerId)) return;
    const polite = this.myId > peerId;
    const pp = new PerfectPeer(polite, (payload) => this.sendSignal(peerId, payload), { iceServers: this.iceServers });
    const entry: MeshPeer = { pp, stream: null, videoSender: null, audioSender: null };
    pp.pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      entry.stream = stream;
      this.onTrack(peerId, stream, ev.track);
    };
    for (const evt of ['connectionstatechange', 'iceconnectionstatechange', 'signalingstatechange'] as const) {
      pp.pc.addEventListener(evt, () => this.onStateChange(peerId));
    }
    if (this.audioTrack) entry.audioSender = pp.pc.addTrack(this.audioTrack, this.localStream);
    if (this.videoTrack) entry.videoSender = pp.pc.addTrack(this.videoTrack, this.localStream);
    this.peers.set(peerId, entry);
  }

  remove(peerId: PeerId) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.pp.close();
    this.peers.delete(peerId);
  }

  removeAll() { for (const id of [...this.peers.keys()]) this.remove(id); }

  handleSignal(from: PeerId, payload: SignalPayload) {
    if (isObserver(from)) return;
    if (!this.peers.has(from)) this.add(from); // they beat our peerJoined handling
    void this.peers.get(from)!.pp.handle(payload);
  }

  setAudioTrack(track: MediaStreamTrack | null) {
    this.audioTrack = track;
    for (const entry of this.peers.values()) {
      if (track && !entry.audioSender) entry.audioSender = entry.pp.pc.addTrack(track, this.localStream);
      else if (track && entry.audioSender) void entry.audioSender.replaceTrack(track);
      else if (!track && entry.audioSender) { entry.pp.pc.removeTrack(entry.audioSender); entry.audioSender = null; }
    }
  }

  /** Camera toggles mid-session: add/remove the sender and let negotiation run. */
  setVideoTrack(track: MediaStreamTrack | null) {
    this.videoTrack = track;
    for (const entry of this.peers.values()) {
      if (track && !entry.videoSender) entry.videoSender = entry.pp.pc.addTrack(track, this.localStream);
      else if (track && entry.videoSender) void entry.videoSender.replaceTrack(track);
      else if (!track && entry.videoSender) { entry.pp.pc.removeTrack(entry.videoSender); entry.videoSender = null; }
    }
  }
}
