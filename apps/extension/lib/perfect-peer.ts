import { log } from './log';
/**
 * Perfect negotiation, per the MDN reference implementation. Not hand-rolled:
 * the polite/impolite roles, rollback-on-collision and candidate handling are
 * exactly MDN's, wrapped so both the mesh and the page loopback can use it.
 * https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
 */
export type SignalPayload = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null };

/**
 * A connection stuck in `checking` is never reported as `failed` by Chrome until its
 * consent checks run out (tens of seconds), and one that never gathered a usable pair
 * may never be reported at all. Restart ICE ourselves once this long has passed.
 */
export const ICE_STALL_MS = 5000;

export class PerfectPeer {
  readonly pc: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;
  /**
   * Candidates that arrived before a remote description existed. Adding one then throws
   * InvalidStateError and the candidate is lost for good — and with trickle ICE the first
   * candidates routinely overtake the answer they belong to.
   */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private stallTimer: ReturnType<typeof setTimeout> | null = null;

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
      if (this.pc.iceConnectionState === 'failed') this.restartIce('failed');
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'connected') this.clearStallTimer();
    };
    this.armStallTimer();
  }

  private armStallTimer() {
    this.clearStallTimer();
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      if (this.pc.connectionState === 'connected' || this.pc.connectionState === 'closed') return;
      this.restartIce(`stalled in ${this.pc.iceConnectionState}`);
    }, ICE_STALL_MS);
  }

  private clearStallTimer() {
    if (this.stallTimer) { clearTimeout(this.stallTimer); this.stallTimer = null; }
  }

  private restartIce(why: string) {
    log('rtc', 'restarting ice', why, `polite=${this.polite}`);
    // Only the impolite side re-offers: a simultaneous restart collides, and the collision
    // is resolved by discarding one side's freshly gathered candidates.
    if (!this.polite) this.pc.restartIce();
    this.armStallTimer();
  }

  /** Candidates are only valid once a remote description is set; buffer until then. */
  private async addCandidate(candidate: RTCIceCandidateInit | null) {
    if (candidate === null) { await this.pc.addIceCandidate(undefined); return; }
    if (!this.pc.remoteDescription) { this.pendingCandidates.push(candidate); return; }
    await this.pc.addIceCandidate(candidate);
  }

  private async flushPendingCandidates() {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of queued) {
      try { await this.pc.addIceCandidate(c); }
      catch (err) { log('rtc', 'queued candidate rejected', String(err)); }
    }
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
        await this.flushPendingCandidates();
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this.signal({ description: pc.localDescription!.toJSON() });
        }
      } else if (candidate !== undefined) {
        try {
          await this.addCandidate(candidate ?? null);
        } catch (err) {
          if (!this.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      log('rtc', 'signal handling failed', String(err));
    }
  }

  close() {
    this.clearStallTimer();
    this.pendingCandidates = [];
    this.pc.onnegotiationneeded = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.close();
  }
}
