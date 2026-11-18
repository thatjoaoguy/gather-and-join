/**
 * Firefox's call tab: captures the mic and camera the background page may not, and
 * sends them to it over a loopback RTCPeerConnection (the other end is
 * `lib/tab-capture.ts`). It offers once, with an audio and a video transceiver, so a
 * capture or a release is a replaceTrack and never a renegotiation.
 *
 * getUserMedia waits until its document has focus (the media capture spec says so, and
 * Firefox does), and this tab lives pinned in the background: a capture started there
 * never resolves. So it comes to the front for the moment it takes to start one, then
 * goes back to the tab you were on. A running capture carries on in the background.
 */
import type { CaptureKind } from './local-media';
import type { FromCallTab, ToCallTab } from './messages';
import type { SignalPayload } from './perfect-peer';

export type DeviceState =
  | { state: 'off' }
  | { state: 'on'; label: string; stream: MediaStream }
  | { state: 'error'; error: string };
export type CallTabState = Record<CaptureKind, DeviceState>;

/** The offering end of the loopback: an impolite PerfectPeer in production. */
export type OfferingPeer = {
  readonly pc: { addTransceiver(kind: CaptureKind, init: RTCRtpTransceiverInit): { sender: Pick<RTCRtpSender, 'replaceTrack'> } };
  handle(payload: SignalPayload): unknown;
  close(): void;
};

export type CallTabDeps = {
  post(m: FromCallTab): void;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  hasFocus(): boolean;
  /** Bring this tab to the front; resolves with how to go back to the tab that was there. */
  focusSelf(): Promise<() => void>;
  createPeer(signal: (payload: SignalPayload) => void): OfferingPeer;
  onChange(state: CallTabState): void;
};

export class CallTab {
  private readonly peer: OfferingPeer;
  private readonly senders: Record<CaptureKind, Pick<RTCRtpSender, 'replaceTrack'>>;
  private readonly streams = new Map<CaptureKind, MediaStream>();
  readonly state: CallTabState = { audio: { state: 'off' }, video: { state: 'off' } };

  constructor(private readonly deps: CallTabDeps) {
    this.peer = deps.createPeer((payload) => deps.post({ type: 'signal', payload }));
    this.senders = {
      audio: this.peer.pc.addTransceiver('audio', { direction: 'sendonly' }).sender,
      video: this.peer.pc.addTransceiver('video', { direction: 'sendonly' }).sender,
    };
  }

  async handle(m: ToCallTab) {
    switch (m.type) {
      case 'signal': await this.peer.handle(m.payload as SignalPayload); return;
      case 'capture': await this.capture(m.id, m.kind, m.constraints); return;
      case 'release': this.release(m.kind); return;
    }
  }

  close() {
    for (const kind of [...this.streams.keys()]) this.stop(kind);
    this.peer.close();
  }

  private async capture(id: number, kind: CaptureKind, constraints: MediaTrackConstraints) {
    // If Firefox has to ask, the prompt is in this tab too, so it stays up until it is answered.
    const goBack = this.deps.hasFocus() ? null : await this.deps.focusSelf().catch(() => null);
    try {
      const stream = await this.deps.getUserMedia(kind === 'audio' ? { audio: constraints } : { video: constraints }).finally(() => goBack?.());
      const track = (kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks())[0];
      if (!track) throw new DOMException(`no ${kind} track`, 'NotFoundError');
      this.stop(kind);
      await this.senders[kind].replaceTrack(track);
      this.streams.set(kind, stream);
      this.set(kind, { state: 'on', label: track.label, stream });
      this.deps.post({ type: 'captured', id, ok: true });
    } catch (e) {
      const name = (e as DOMException)?.name || 'Error';
      this.set(kind, { state: 'error', error: name });
      this.deps.post({ type: 'captured', id, ok: false, error: name, message: String((e as Error)?.message ?? e) });
    }
  }

  private release(kind: CaptureKind) {
    this.stop(kind);
    void this.senders[kind].replaceTrack(null);
    this.set(kind, { state: 'off' });
  }

  private stop(kind: CaptureKind) {
    this.streams.get(kind)?.getTracks().forEach((t) => t.stop());
    this.streams.delete(kind);
  }

  private set(kind: CaptureKind, s: DeviceState) {
    this.state[kind] = s;
    this.deps.onChange(this.state);
  }
}
