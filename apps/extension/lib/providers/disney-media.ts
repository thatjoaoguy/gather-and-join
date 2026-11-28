/**
 * A <video>-shaped facade over the Disney+ player, as yt-embed-media.ts is for
 * Drive: the slice of HTMLVideoElement that VideoBinding, SyncEngine, CopyTracker
 * and Ducker use, on the program's clock instead of the element's.
 *
 * Position is the visible <video>'s `currentTime` plus the offset the page-world
 * half reports (disney-page.ts), so it is as fine-grained as a real element's.
 * Seeks go to the player's own `mediaPlayer.seek`: a `currentTime` write cannot
 * reach past the ~11s the player has loaded. Play, pause, rate and volume act on
 * what they always did (play and pause through the player, so its controls agree).
 *
 * Event shaping, all of it for one player habit: a seek while playing fires
 * pause → seeking → play → seeked → playing on the element. Passed through, that
 * reaches the room as a pause, a seek and a play. So:
 *  - a seek this facade commands swallows the element's whole burst, and the
 *    `seeking` it dispatches itself is the one SyncEngine tagged;
 *  - a seek from the player's controls is reported once, as `seeking`, when the
 *    page has the new offset; until then the position holds still;
 *  - a `pause` from the controls is held briefly in case a `seeking` follows,
 *    which makes it part of a seek; a `play` inside that hold is the same burst
 *    in Firefox's order (pause → play → seeking), and is dropped with it. A pause SyncEngine commanded goes through at
 *    once, so it lands inside SyncEngine's echo window.
 * The element's own `durationchange` is never passed on: it is the end of what is
 * loaded, growing every few seconds. The facade's carries the program's length.
 */
import type { Channel, FromPage, ToPage } from './disney-channel';
import { PLAYER_SELECTOR, visibleVideo } from './disney-channel';
import { MediaEvents } from './media-events';

type Timers = { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(t: unknown): void };
const realTimers: Timers = { now: () => performance.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) };

/** Long enough for the `seeking` that follows a seek's opening `pause` (~150ms measured). */
export const PAUSE_HOLD_MS = 300;
/** A pause this soon after one we commanded is its echo, and goes straight through. */
const OWN_PAUSE_MS = 1000;
/** A commanded seek the page never confirms stops holding the position after this. */
const SEEK_GIVE_UP_MS = 5000;
/** Element events that are passed on, when no seek is under way. */
const FORWARDED = ['play', 'pause', 'seeking', 'waiting', 'playing', 'ended'] as const;

/** Events from MediaEvents, not EventTarget: see there for why, in Firefox. */
export class DisneyMedia extends MediaEvents {
  readonly dataset: Record<string, string> = {};
  /** The page has sent an offset it trusts at least once. Until then there is no position to give. */
  ready = false;
  private offsetSec: number | null = null;
  private durationMs: number | null = null;
  /** The last position worked out from a trusted offset, held while the offset is unknown. */
  private lastSec = 0;
  private lastAt = 0;
  /** A seek this facade asked for, and whether the viewer was paused, until the page has the new offset. */
  private pending: { targetSec: number; at: number; paused: boolean } | null = null;
  /** The player is seeking on its own (its controls); reported once the offset settles. */
  private ownSeek = false;
  private ownSeekAt = 0;
  /** Whether the viewer was playing when the player's own seek began: the held position moves on meanwhile. */
  private ownSeekPlaying = false;
  private heldPause: unknown = null;
  /** A held pause met its play: the rest of that burst (playing, waiting) is not passed on until this. */
  private burstUntil = -Infinity;
  private pausedByUsAt = -Infinity;
  /** After a pending seek settles, the play or pause that puts things back is ours too: these events are not passed on. */
  private quiet: { kinds: Set<string>; until: number } | null = null;
  private rate = 1;
  private upNext = false;
  private vol: number | null = null;
  private active: HTMLVideoElement | null = null;
  private readonly wired = new WeakSet<HTMLVideoElement>();
  private readonly unlisten: () => void;

  constructor(
    private readonly player: Element,
    private readonly channel: Channel<ToPage, FromPage>,
    /** Called when the facade becomes ready, which is not a DOM change VideoBinding would notice. */
    private readonly onReady: () => void,
    private readonly timers: Timers = realTimers,
  ) {
    super();
    this.unlisten = channel.listen((m) => { if (m.kind === 'state') this.onState(m); });
    this.refresh();
    channel.send({ kind: 'hello' });
  }

  destroy() {
    this.unlisten();
    if (this.heldPause !== null) this.timers.clearTimeout(this.heldPause);
  }

  /** Pick up <video>s the player has added and follow the visible one. Cheap; called on every DOM scan. */
  refresh() {
    for (const v of this.player.querySelectorAll('video')) {
      if (this.wired.has(v)) continue;
      this.wired.add(v);
      for (const kind of [...FORWARDED, 'seeked']) v.addEventListener(kind, () => { if (v === this.video()) this.onElement(kind); });
      // Keeps the held position fresh between SyncEngine's reads, for when the offset goes away.
      v.addEventListener('timeupdate', () => { if (v === this.video()) void this.currentTime; });
    }
    this.video();
  }

  /** The visible <video>, carrying over the rate and volume set on the one before it. */
  private video(): HTMLVideoElement | null {
    const v = visibleVideo(this.player);
    if (v && v !== this.active) {
      if (v.playbackRate !== this.rate) v.playbackRate = this.rate;
      if (this.vol !== null) v.volume = this.vol;
    }
    this.active = v;
    return v;
  }

  get element(): Element { return this.player; }
  get isConnected(): boolean { return this.player.isConnected; }

  // --- the HTMLVideoElement slice -----------------------------------------

  get currentTime(): number {
    if (this.pending && this.timers.now() - this.pending.at > SEEK_GIVE_UP_MS) this.pending = null;
    // Moving with the clock, as the room's expected position does. Held still, a seek
    // that takes longer than a tick reads as fresh drift and draws another seek, and
    // another: a storm (seen under the drift sabotage, and a real seek took 2.4s).
    if (this.pending) return this.pending.targetSec + (this.pending.paused ? 0 : ((this.timers.now() - this.pending.at) / 1000) * this.rate);
    const now = this.timers.now();
    if (this.ownSeek && now - this.ownSeekAt > SEEK_GIVE_UP_MS) this.ownSeek = false;
    // Until the player's own seek is confirmed, the old timeline carries on: the new
    // position is not known yet, and a position held still would read as drift and
    // be "corrected" back, undoing the viewer's seek before it reached the room.
    if (this.ownSeek) return this.lastSec + (this.ownSeekPlaying ? ((now - this.lastAt) / 1000) * this.rate : 0);
    const v = this.video();
    // Mid-seek the element is already on the new media and the offset still on the old: hold the last good one.
    if (v && this.offsetSec !== null && !v.seeking) { this.lastSec = v.currentTime + this.offsetSec; this.lastAt = now; }
    return this.lastSec;
  }
  set currentTime(sec: number) {
    this.cancelHeldPause();
    // Optimistic, as in yt-embed-media: report the target until the page confirms it.
    this.pending = { targetSec: sec, at: this.timers.now(), paused: this.paused };
    this.lastSec = sec;
    this.channel.send({ kind: 'seek', ms: Math.round(sec * 1000) });
    this.dispatchEvent(new Event('seeking'));
  }

  get paused(): boolean { return this.video()?.paused ?? true; }
  get ended(): boolean { return this.video()?.ended ?? false; }
  get readyState(): number { return this.video()?.readyState ?? 0; }
  get duration(): number { return this.durationMs === null ? NaN : this.durationMs / 1000; }
  /** The visible element's loaded ranges, moved onto the program's clock like `currentTime`. */
  get buffered(): TimeRanges | undefined {
    const b = this.video()?.buffered;
    const off = this.offsetSec;
    if (!b || off === null) return undefined;
    return { length: b.length, start: (i: number) => b.start(i) + off, end: (i: number) => b.end(i) + off } as unknown as TimeRanges;
  }

  get playbackRate(): number { return this.rate; }
  set playbackRate(r: number) {
    this.rate = r;
    const v = this.video();
    if (v && v.playbackRate !== r) v.playbackRate = r;
  }

  get volume(): number { return this.vol ?? this.video()?.volume ?? 1; }
  set volume(x: number) {
    this.vol = x;
    const v = this.video();
    if (v) v.volume = x;
  }

  /** A pending seek's position so far becomes its target, before playing or pausing changes how it moves. */
  private rebase(paused: boolean) {
    if (!this.pending) return;
    this.pending = { ...this.pending, targetSec: this.currentTime, at: this.timers.now(), paused };
  }

  play(): Promise<void> {
    this.rebase(false);
    this.channel.send({ kind: 'play' });
    return Promise.resolve();
  }
  pause(): void {
    this.rebase(true);
    this.pausedByUsAt = this.timers.now();
    this.channel.send({ kind: 'pause' });
  }

  /**
   * Followers only: keep the player's next-episode countdown from moving this
   * viewer on. Sent again on the page's first word, in case it was not there yet.
   */
  suppressUpNext(on: boolean) {
    this.upNext = on;
    this.channel.send({ kind: 'upNext', suppress: on });
  }

  // --- what the page says ----------------------------------------------------

  private onState(m: FromPage) {
    if (m.durationMs !== this.durationMs) {
      this.durationMs = m.durationMs;
      if (this.ready) this.dispatchEvent(new Event('durationchange'));
    }
    if (m.offsetSec === null) { this.offsetSec = null; return; }
    this.offsetSec = m.offsetSec;
    if (!this.ready) {
      this.ready = true;
      if (this.upNext) this.channel.send({ kind: 'upNext', suppress: true });
      this.onReady();
    }
    if (this.pending) {
      const { paused } = this.pending;
      this.pending = null;
      // A seek leaves the player as it was, as measured; if it did not, put it back without telling the room.
      if (paused !== this.paused) {
        this.quiet = { kinds: new Set(paused ? ['pause'] : ['play', 'playing']), until: this.timers.now() + OWN_PAUSE_MS };
        if (paused) this.pause(); else void this.play();
      }
    }
    if (this.ownSeek) {
      this.ownSeek = false;
      this.dispatchEvent(new Event('seeking'));
    }
  }

  // --- what the element does --------------------------------------------------

  private onElement(kind: string) {
    const now = this.timers.now();
    if (this.quiet && now < this.quiet.until && this.quiet.kinds.has(kind)) { this.quiet.kinds.delete(kind); return; }
    if (this.pending) return; // our own seek's burst
    if (kind === 'seeking') {
      // A pause still held back means it was playing until this seek's own pause.
      this.ownSeekPlaying = this.heldPause !== null || !this.paused;
      this.cancelHeldPause(); // it opened this seek
      this.ownSeek = true;
      this.ownSeekAt = now;
      return;
    }
    if (this.ownSeek) return; // the rest of the player's seek: play, seeked, playing, waiting
    if (kind === 'seeked') return;
    // Firefox delivers the burst as pause → play → seeking. A play that finds a pause still
    // held is that burst's: both are dropped, and a `seeking` after them is reported as the
    // seek. A real pause and resume inside 300ms tells the room nothing it needs either.
    if (kind === 'play' && this.heldPause !== null) {
      this.cancelHeldPause();
      this.burstUntil = now + PAUSE_HOLD_MS;
      return;
    }
    if ((kind === 'playing' || kind === 'waiting' || kind === 'play') && now < this.burstUntil) return;
    if (kind === 'pause' && now - this.pausedByUsAt > OWN_PAUSE_MS) {
      this.cancelHeldPause();
      this.heldPause = this.timers.setTimeout(() => {
        this.heldPause = null;
        if (this.paused && !this.ownSeek && !this.pending) this.dispatchEvent(new Event('pause'));
      }, PAUSE_HOLD_MS);
      return;
    }
    this.dispatchEvent(new Event(kind));
  }

  private cancelHeldPause() {
    if (this.heldPause === null) return;
    this.timers.clearTimeout(this.heldPause);
    this.heldPause = null;
  }
}

/**
 * A findVideo/findAnchor pair over the Disney+ player, memoised per player
 * element as embedMedia is per iframe: VideoBinding takes a different object for
 * a recreated element and would re-wire on every DOM mutation.
 *
 * No facade is reported until the page has sent a trusted offset, so nothing
 * reads a position that is not there yet; `onChange` is how VideoBinding hears
 * that it is. The page-world half is asked for once per content script: the
 * request is idempotent, and a re-injected content script asks again.
 */
export function disneyMedia(deps: { channel(): Channel<ToPage, FromPage>; requestBridge(): void }) {
  let player: Element | null = null;
  let media: DisneyMedia | null = null;
  let notify: (() => void) | null = null;
  let asked = false;
  let upNext = false;

  const anchor = (root: ParentNode): HTMLElement | null => {
    const found = root.querySelector<HTMLElement>(PLAYER_SELECTOR);
    if (found !== player) {
      media?.destroy();
      media = null;
      player = found;
    }
    return found;
  };

  return {
    findAnchor: anchor,
    findVideo(root: ParentNode): HTMLVideoElement | null {
      const p = anchor(root);
      if (!p) return null;
      if (!asked) { asked = true; deps.requestBridge(); }
      if (!media) {
        media = new DisneyMedia(p, deps.channel(), () => notify?.());
        if (upNext) media.suppressUpNext(true);
      }
      media.refresh();
      // Structurally the slice of HTMLVideoElement its consumers touch; see the class doc.
      return media.ready ? (media as unknown as HTMLVideoElement) : null;
    },
    onChange(fn: () => void) { notify = fn; },
    suppressUpNext(on: boolean) {
      upNext = on;
      media?.suppressUpNext(on);
    },
  };
}
