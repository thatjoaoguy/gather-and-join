import { log } from './log';
/**
 * Perfect negotiation, per the MDN reference implementation. Not hand-rolled:
 * the polite/impolite roles, rollback-on-collision and candidate handling are
 * exactly MDN's, wrapped so both the mesh and the page loopback can use it.
 * https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
 */
export type SignalPayload = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null };

export class PerfectPeer {
  readonly pc: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;

  constructor(
    readonly polite: boolean,
    private readonly signal: (payload: SignalPayload) => void,
    config: RTCConfiguration,
  ) {
    this.pc = new RTCPeerConnection(config);
    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        this.signal({ description: this.pc.localDescription!.toJSON() });
      } catch (err) {
        log('rtc', 'negotiationneeded failed', String(err));
      } finally {
        this.makingOffer = false;
      }
    };
    // Trickle ICE: send each candidate as it is discovered.
    this.pc.onicecandidate = ({ candidate }) => this.signal({ candidate: candidate ? candidate.toJSON() : null });
    this.pc.oniceconnectionstatechange = () => {
      // Laptops sleeping and waking land here. Restart ICE; never tear down.
      if (this.pc.iceConnectionState === 'failed') this.pc.restartIce();
    };
  }

  async handle({ description, candidate }: SignalPayload) {
    const pc = this.pc;
    try {
      if (description) {
        const readyForOffer = !this.makingOffer && (pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending);
        const offerCollision = description.type === 'offer' && !readyForOffer;
        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) return;
        this.isSettingRemoteAnswerPending = description.type === 'answer';
        await pc.setRemoteDescription(description); // implicit rollback for the polite peer
        this.isSettingRemoteAnswerPending = false;
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this.signal({ description: pc.localDescription!.toJSON() });
        }
      } else if (candidate !== undefined) {
        try {
          await pc.addIceCandidate(candidate ?? undefined);
        } catch (err) {
          if (!this.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      log('rtc', 'signal handling failed', String(err));
    }
  }

  close() {
    this.pc.onnegotiationneeded = null;
    this.pc.onicecandidate = null;
    this.pc.close();
  }
}
