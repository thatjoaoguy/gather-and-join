/**
 * Clock-offset estimation and drift-correction policy. Pure functions so the
 * numbers can be unit tested without a browser.
 */

export type PingSample = { clientTime: number; serverTime: number; receivedAt: number };

/**
 * Best-sample offset estimate: keep the sample with the lowest RTT and
 * compute `offset = serverTime - (clientTime + rtt/2)`. Add `offset` to a
 * local timestamp to get server time.
 */
export function estimateOffset(samples: PingSample[]): { offsetMs: number; rttMs: number } | null {
  let best: PingSample | null = null;
  let bestRtt = Infinity;
  for (const s of samples) {
    const rtt = s.receivedAt - s.clientTime;
    if (rtt >= 0 && rtt < bestRtt) {
      bestRtt = rtt;
      best = s;
    }
  }
  if (!best) return null;
  return { offsetMs: best.serverTime - (best.clientTime + bestRtt / 2), rttMs: bestRtt };
}

export const PING_SAMPLES = 5;
export const OFFSET_REFRESH_MS = 60_000;
export const HEARTBEAT_MS = 5_000;
export const ECHO_SUPPRESS_MS = 500;
/**
 * After a player reports its own stall, its own play and seeking events are not
 * broadcast until the room's pause has come back and this much longer. A player
 * picks itself up the moment data returns, and HBO Max was seen doing it 33ms after
 * its stall reached the others: passed on, that resumes the room for everyone.
 * Nobody means to press play a second after their own picture froze.
 */
export const OWN_STALL_HOLD_MS = 1000;
/**
 * A player that stalled the room reports itself ready once it has this much loaded past
 * where it stopped. Under Disney+'s ~11s loading cap; HBO Max refilled past it within 3s
 * of its network coming back (2026-11-27). Read from what is loaded, never `readyState`:
 * HBO Max said 4 with 1s loaded and 2 with 12s. It only informs; resuming stays manual.
 */
export const READY_AHEAD_MS = 5000;

export const DRIFT_DEAD_ZONE_MS = 250;
export const DRIFT_RATE_EXIT_MS = 100;
export const DRIFT_HARD_SEEK_MS = 1500;
/**
 * Rate nudge. A fixed ±0.03 cannot meet the small-drift test (800ms → <150ms
 * in 8s needs ≥ 0.08), so the nudge scales with drift: |drift|/4000, clamped to
 * [0.03, 0.2]. Large drift corrects briskly, the last 200ms is corrected at a
 * gentle 3%.
 */
export const RATE_NUDGE_MIN = 0.03;
export const RATE_NUDGE_MAX = 0.2;
export const RATE_NUDGE_SCALE_MS = 4000;

export function rateNudge(driftMs: number): number {
  return Math.min(RATE_NUDGE_MAX, Math.max(RATE_NUDGE_MIN, Math.abs(driftMs) / RATE_NUDGE_SCALE_MS));
}

export type Correction =
  | { kind: 'none' }
  | { kind: 'rate'; rate: number }
  | { kind: 'seek' };

/**
 * Drift policy. `drift = localPosition - expectedPosition` (ms). `adjusting` is
 * whether a rate nudge is currently in effect — the dead zone has hysteresis:
 * we enter at 250ms and only release once under 100ms.
 */
export function decideCorrection(driftMs: number, adjusting: boolean): Correction {
  const abs = Math.abs(driftMs);
  if (abs >= DRIFT_HARD_SEEK_MS) return { kind: 'seek' };
  if (abs < DRIFT_RATE_EXIT_MS) return { kind: 'none' };
  if (abs < DRIFT_DEAD_ZONE_MS && !adjusting) return { kind: 'none' };
  // Behind the room (negative drift) → speed up; ahead → slow down.
  const nudge = rateNudge(driftMs);
  return { kind: 'rate', rate: driftMs < 0 ? 1 + nudge : 1 - nudge };
}
