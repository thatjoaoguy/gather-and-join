/**
 * The length of this page's copy of the episode, which is how the room tells
 * copies apart. Two player habits shape it: a recreated element reports NaN until
 * its metadata loads, and an ad break swaps in an element of its own. So the last
 * good length is held per content id, anything shorter than an episode is
 * ignored, and the room hears about a change only when it is more than a reload's
 * wobble.
 *
 * An ad pod can run past MIN_COPY_MS (HBO Max serves 2:27 ones), so the floor
 * alone does not keep it out: once a length is held, a much shorter one on the
 * same content id is an ad, not a new copy. Taking it would tell the room the copy
 * shrank and stop the episode start from describing this copy, which pins the skip
 * at 0 until the page reloads. A much longer one replaces it, because the length
 * held first may have been a pre-roll's.
 */
import { COPY_TOLERANCE_MS } from '@gj/shared';

/** Shorter than any episode, longer than a typical single ad. Not longer than every ad pod: see above. */
export const MIN_COPY_MS = 60_000;
/** A reloaded copy's duration moves by fractions of a second; don't re-report that. Well under COPY_TOLERANCE_MS. */
const REPORT_STEP_MS = 1000;

export class CopyTracker {
  private copy: { contentId: string; durationMs: number } | null = null;
  private reported: { contentId: string; durationMs: number } | null = null;

  constructor(
    private readonly report: (contentId: string, durationMs: number) => void,
    /** The `ad-pod` sabotage turns this off. */
    private readonly holdThroughAds = true,
  ) {}

  /** A `durationchange` (or a fresh element) on `contentId`. True when the known length changed. */
  observe(contentId: string | null, durationSec: number): boolean {
    const durationMs = durationSec * 1000;
    if (!contentId || !Number.isFinite(durationMs) || durationMs < MIN_COPY_MS) return false;
    const held = this.copy?.contentId === contentId ? this.copy.durationMs : null;
    if (this.holdThroughAds && held !== null && durationMs < held - COPY_TOLERANCE_MS) return false; // an ad element, not the episode
    const changed = held !== durationMs;
    this.copy = { contentId, durationMs };
    const last = this.reported;
    if (!last || last.contentId !== contentId || Math.abs(last.durationMs - durationMs) > REPORT_STEP_MS) {
      this.reported = { contentId, durationMs };
      this.report(contentId, durationMs);
    }
    return changed;
  }

  /** The last good length of `contentId` in this copy, or null if it was never measured here. */
  durationFor(contentId: string | null): number | null {
    return contentId && this.copy?.contentId === contentId ? this.copy.durationMs : null;
  }
}
