/**
 * Playback sync for one page. Server room state in, video element commands out.
 *
 *  - Remote playback frames are applied and *tagged* so the echo of our own
 *    play/pause/seeking events is not rebroadcast (500ms window).
 *  - A 250ms tick compares local position with the room's expected position and
 *    applies the drift policy: dead zone, rate nudge, or (≥1500ms only) hard seek.
 *  - The leader heartbeats `playback` every 5s while playing.
 */
import {
  decideCorrection, expectedPositionMs, ECHO_SUPPRESS_MS, HEARTBEAT_MS, DRIFT_DEAD_ZONE_MS, DRIFT_HARD_SEEK_MS,
  type RoomState,
} from '@gaj/shared';
import type { Sabotage } from './constants';
import type { VideoBinding } from './video-binding';

export type RoomPlayback = Pick<RoomState, 'paused' | 'positionMs' | 'updatedAt'>;
export type OutboundPlayback = { paused: boolean; positionMs: number; stalled?: boolean };

export const TICK_MS = 250;
const STALL_CONFIRM_MS = 750;
/** How often the drift summary line is emitted while playing. */
export const DRIFT_REPORT_MS = 30_000;

export class SyncEngine {
  counters = { hardSeeks: 0, rateAdjustments: 0 };
  isLeader = false;
  offsetMs = 0;
  room: RoomPlayback | null = null;

  /** Echo suppression: event kinds we caused ourselves, ignored until `suppressUntil`. */
  private suppressUntil = 0;
  private expected = new Set<'play' | 'pause' | 'seeking'>();
  private adjusting = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeat = 0;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  /** |drift| samples since the last summary, plus the counters as they stood then. */
  private driftSamples: number[] = [];
  private lastReport = 0;
  private reported = { hardSeeks: 0, rateAdjustments: 0 };

  constructor(
    private readonly binding: VideoBinding,
    private readonly send: (out: OutboundPlayback) => void,
    private readonly sabotage: Sabotage,
    /** Diagnostics sink: one human-readable line per notable decision, plus a periodic drift summary. */
    private readonly diag: (line: string) => void = () => {},
  ) {}

  serverNow() { return Date.now() + this.offsetMs; }
  private suppressed(kind: 'play' | 'pause' | 'seeking') {
    if (Date.now() >= this.suppressUntil) { this.expected.clear(); return false; }
    return this.expected.has(kind);
  }
  /** Tag the events a locally-applied remote command will produce. Only the tagged kinds are ignored, so a genuine user action of another kind still propagates. */
  private tag(...kinds: Array<'play' | 'pause' | 'seeking'>) {
    if (this.sabotage === 'echo-suppress' || kinds.length === 0) return;
    if (Date.now() >= this.suppressUntil) this.expected.clear();
    for (const k of kinds) this.expected.add(k);
    this.suppressUntil = Date.now() + ECHO_SUPPRESS_MS;
  }
  private seekTo(v: HTMLVideoElement, ms: number, why: string) {
    this.diag(`hard seek to ${Math.round(ms)}ms (${why})`);
    this.tag('seeking');
    v.currentTime = ms / 1000;
    this.counters.hardSeeks++;
  }

  start() {
    this.lastReport = Date.now();
    this.tickTimer ??= setInterval(() => this.tick(), TICK_MS);
  }
  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  // ---- local events (from VideoBinding) ------------------------------------

  onLocalPlay(v: HTMLVideoElement) {
    if (this.suppressed('play')) return;
    this.cancelStall();
    this.announce({ paused: false, positionMs: v.currentTime * 1000 }, 'play');
  }
  onLocalPause(v: HTMLVideoElement) {
    if (this.suppressed('pause')) return;
    if (v.ended) return; // media fires `pause` then `ended`; the ended path decides
    this.cancelStall();
    this.announce({ paused: true, positionMs: v.currentTime * 1000 }, 'pause');
  }
  onLocalSeeking(v: HTMLVideoElement) {
    if (this.suppressed('seeking')) return;
    this.announce({ paused: v.paused, positionMs: v.currentTime * 1000 }, 'seek');
  }
  onLocalEnded(_v: HTMLVideoElement) {
    // End of content belongs to the player (HBO Max auto-advances at the natural end,
    // on every client, and shows its own end screen otherwise). Broadcasting a pause
    // here would freeze peers a few hundred ms short of their own end and stop *their*
    // auto-advance. The leader's transition is what moves the room.
    this.cancelStall();
  }

  /**
   * Broadcast a local action and adopt it as the room's state right away. The
   * server echoes the same values; without this, our own drift tick would
   * "correct" a user's seek back to the old position before the echo arrives.
   */
  private announce(out: OutboundPlayback, kind: 'play' | 'pause' | 'seek') {
    this.diag(`local ${kind} at ${Math.round(out.positionMs)}ms`);
    if (this.room) this.room = { paused: out.paused, positionMs: out.positionMs, updatedAt: this.serverNow() };
    this.send(out);
  }
  onLocalWaiting(v: HTMLVideoElement) {
    // `waiting` also fires briefly on every seek; only a sustained stall pauses the room.
    if (this.stallTimer) return;
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      const cur = this.binding.get();
      if (cur !== v || v.paused || v.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      if (!this.room || this.room.paused) return;
      this.diag(`stalled at ${Math.round(v.currentTime * 1000)}ms (readyState ${v.readyState}); pausing the room`);
      this.send({ paused: true, positionMs: v.currentTime * 1000, stalled: true });
    }, STALL_CONFIRM_MS);
  }
  onLocalPlaying() { this.cancelStall(); }
  private cancelStall() {
    if (this.stallTimer) { clearTimeout(this.stallTimer); this.stallTimer = null; }
  }

  // ---- remote state ----------------------------------------------------------

  /** A `playback` frame or a fresh room snapshot: adopt it and correct now. */
  applyRemote(room: RoomPlayback, offsetMs = this.offsetMs) {
    this.offsetMs = offsetMs;
    this.room = room;
    this.reconcile(true);
  }

  /** A (re)created element: re-apply whatever the room is doing. */
  onVideoAttached() {
    this.adjusting = false;
    this.reconcile(true);
  }

  /** Test seam: move the local position without telling the room. */
  forceDrift(ms: number) {
    const v = this.binding.get();
    if (!v) return;
    this.tag('seeking');
    v.currentTime += ms / 1000;
  }

  private localPositionMs(v: HTMLVideoElement) { return v.currentTime * 1000; }

  /**
   * Bring the element in line with room state. `immediate` is set when a
   * remote command just arrived: play/pause state is applied unconditionally
   * and paused-room position is snapped (there is no rate to nudge while paused).
   */
  private reconcile(immediate: boolean) {
    const v = this.binding.get();
    if (!v || !this.room) return;
    const expected = expectedPositionMs(this.room, this.serverNow());
    const drift = this.localPositionMs(v) - expected;
    if (immediate) this.diag(`apply ${this.room.paused ? 'pause' : 'play'} expected=${Math.round(expected)}ms drift=${Math.round(drift)}ms`);

    if (this.room.paused) {
      if (immediate) {
        if (!v.paused) { this.tag('pause'); v.pause(); }
        if (Math.abs(drift) > DRIFT_DEAD_ZONE_MS) this.seekTo(v, expected, `paused room, drift ${Math.round(drift)}ms`);
        this.setRate(v, 1);
      }
      return;
    }

    if (immediate && v.paused) {
      if (Math.abs(drift) >= DRIFT_HARD_SEEK_MS) this.seekTo(v, expected, `resume, drift ${Math.round(drift)}ms`);
      this.tag('play');
      v.play().catch(() => {});
      return;
    }
    if (v.paused) return; // user paused locally; the pause was (or will be) broadcast

    this.correct(v, drift);
  }

  private correct(v: HTMLVideoElement, drift: number) {
    this.driftSamples.push(Math.abs(drift));
    let decision = decideCorrection(drift, this.adjusting);
    if (this.sabotage === 'drift' && Math.abs(drift) >= DRIFT_DEAD_ZONE_MS) decision = { kind: 'seek' };

    switch (decision.kind) {
      case 'seek': {
        this.seekTo(v, expectedPositionMs(this.room!, this.serverNow()), `drift ${Math.round(drift)}ms`);
        this.setRate(v, 1);
        return;
      }
      case 'rate': {
        if (!this.adjusting) {
          this.adjusting = true;
          this.counters.rateAdjustments++;
          this.diag(`nudge rate=${decision.rate.toFixed(3)} drift=${Math.round(drift)}ms`);
        }
        this.setRate(v, decision.rate);
        return;
      }
      case 'none':
        this.setRate(v, 1);
        return;
    }
  }

  private setRate(v: HTMLVideoElement, rate: number) {
    if (rate === 1 && this.adjusting) { this.adjusting = false; this.diag('nudge done'); }
    if (v.playbackRate !== rate) v.playbackRate = rate;
  }

  /** Every DRIFT_REPORT_MS while playing: how far off we were, and what it cost to fix. */
  private report(now: number) {
    if (now - this.lastReport < DRIFT_REPORT_MS) return;
    this.lastReport = now;
    const n = this.driftSamples.length;
    if (n === 0) return;
    const sorted = this.driftSamples.sort((a, b) => a - b);
    const seeks = this.counters.hardSeeks - this.reported.hardSeeks;
    const nudges = this.counters.rateAdjustments - this.reported.rateAdjustments;
    this.diag(`drift ${DRIFT_REPORT_MS / 1000}s: n=${n} p50=${Math.round(sorted[n >> 1]!)}ms max=${Math.round(sorted[n - 1]!)}ms seeks=${seeks} nudges=${nudges}`);
    this.driftSamples = [];
    this.reported = { ...this.counters };
  }

  private tick() {
    this.reconcile(false);
    this.report(Date.now());
    const v = this.binding.get();
    if (this.isLeader && v && !v.paused && this.room && !this.room.paused) {
      const now = Date.now();
      if (now - this.lastHeartbeat >= HEARTBEAT_MS) {
        this.lastHeartbeat = now;
        this.send({ paused: false, positionMs: v.currentTime * 1000 });
      }
    }
  }
}
