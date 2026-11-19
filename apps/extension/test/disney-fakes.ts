/**
 * Stand-ins for the Disney+ player as measured on the real site (2026-11-18): two
 * <video>s, the hidden one first, and a `mediaPlayer` whose playhead is only
 * brought up to date in its own `timeupdate` handler. vitest runs in node, so
 * these are EventTargets with the properties the adapter reads, not elements.
 */
import type { Channel, FromPage, ToPage } from '../lib/providers/disney-channel';
import type { MediaPlayer } from '../lib/providers/disney-page';

export class FakeVideo extends EventTarget {
  currentTime = 0;
  paused = true;
  seeking = false;
  ended = false;
  readyState = 4;
  playbackRate = 1;
  volume = 1;
  style = { display: '' };
  constructor(hidden = false) {
    super();
    if (hidden) { this.style.display = 'none'; this.readyState = 0; }
  }
  fire(...kinds: string[]) { for (const k of kinds) this.dispatchEvent(new Event(k)); }
}

/** The player element: its <video>s, hidden one first, and the page-world `mediaPlayer`. */
export class FakePlayer {
  readonly hidden = new FakeVideo(true);
  readonly video = new FakeVideo();
  isConnected = true;
  /** Program position = video.currentTime + offset; the player's own timeupdate handler copies it into the playhead. */
  offsetSec = -20;
  durationMs = 3_276_240;
  hasEnd = true;
  hides = 0;
  seeks: number[] = [];
  readonly info = { playheadPositionMs: 0, programDurationMs: this.durationMs, hasEnd: true };
  readonly mediaPlayer: MediaPlayer = {
    seek: (ms) => { this.seeks.push(ms); },
    play: () => { this.video.paused = false; this.video.fire('play', 'playing'); },
    pause: () => { this.video.paused = true; this.video.fire('pause'); },
    timeline: { info: this.info },
    continuousPlay: { hide: () => { this.hides++; } },
  };
  constructor() {
    // Registered first, as the player's own listener is: the adapter's run after it.
    this.video.addEventListener('timeupdate', () => this.updatePlayhead());
  }
  updatePlayhead() {
    this.info.playheadPositionMs = (this.video.currentTime + this.offsetSec) * 1000;
    this.info.programDurationMs = this.durationMs;
    this.info.hasEnd = this.hasEnd;
  }
  querySelectorAll(sel: string) { return sel === 'video' ? [this.hidden, this.video] : []; }
  querySelector(sel: string) { return sel === 'video' ? this.hidden : null; }
  /** Play forward `sec` with a timeupdate, as the element does ~4 times a second. */
  advance(sec: number) { this.video.currentTime += sec; this.video.fire('timeupdate'); }
  /** The player's reload on a seek: new media, new offset, the burst measured while playing. */
  reloadTo(programSec: number, mediaSec = 20) {
    const wasPlaying = !this.video.paused;
    if (wasPlaying) { this.video.paused = true; this.video.fire('pause'); }
    this.video.seeking = true;
    this.video.currentTime = mediaSec;
    this.offsetSec = programSec - mediaSec;
    this.video.fire('seeking');
    if (wasPlaying) { this.video.paused = false; this.video.fire('play'); }
    this.video.seeking = false;
    this.video.fire('seeked');
    if (wasPlaying) this.video.fire('playing');
  }
}

/** The document, as far as the page half looks: just the player element. */
export const docWith = (player: FakePlayer | null) => ({ querySelector: (sel: string) => (sel === 'disney-web-player' ? player : null) }) as unknown as ParentNode;

/** A synchronous in-memory channel, as DOM event dispatch is across worlds. */
export function pipe() {
  const toPage = new Set<(m: ToPage) => void>();
  const fromPage = new Set<(m: FromPage) => void>();
  const sentToPage: ToPage[] = [];
  const sentFromPage: FromPage[] = [];
  const facade: Channel<ToPage, FromPage> = {
    send: (m) => { sentToPage.push(m); toPage.forEach((f) => f(m)); },
    listen: (f) => { fromPage.add(f); return () => fromPage.delete(f); },
  };
  const page: Channel<FromPage, ToPage> = {
    send: (m) => { sentFromPage.push(m); fromPage.forEach((f) => f(m)); },
    listen: (f) => { toPage.add(f); return () => toPage.delete(f); },
  };
  return { facade, page, sentToPage, sentFromPage };
}

/** A clock and timers the test moves by hand. */
export function manualTimers() {
  let t = 0;
  let seq = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimeout: (fn: () => void, ms: number) => { const id = ++seq; tasks.set(id, { at: t + ms, fn }); return id; },
    clearTimeout: (id: unknown) => { tasks.delete(id as number); },
    advance(ms: number) {
      t += ms;
      for (const [id, task] of [...tasks].sort((a, b) => a[1].at - b[1].at)) {
        if (task.at > t) continue;
        tasks.delete(id);
        task.fn();
      }
    },
  };
}
