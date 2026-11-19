/**
 * The page-world half of the Disney+ adapter: reads the player's own clock and
 * carries out the facade's commands. Runs in the page's JavaScript world (see
 * entrypoints/disney-bridge.ts), the only place `mediaPlayer` is visible.
 *
 * What it reports is an offset, not a position. The visible <video>'s
 * `currentTime` is frame-accurate but on the wrong clock; the player's
 * `timeline.info.playheadPositionMs` is on the right clock but is only set
 * inside the player's own `timeupdate` handler, ~4 times a second, and is stale
 * in between. Read from a `timeupdate` listener registered after the player's,
 * the two give an offset that held to the millisecond across a whole episode
 * (measured 2026-11-18), so the facade can add it to `currentTime` and get the
 * program position at frame accuracy. Read at any other moment, the offset is
 * off by up to 250ms, which is the drift dead zone.
 *
 * The offset changes when the player reloads its media, which every seek does.
 * From `seeking` until two agreeing samples after `seeked` it is reported as
 * unknown, so the old one is never applied to the new media.
 */
import { PLAYER_SELECTOR, visibleVideo, type Channel, type FromPage, type ToPage } from './disney-channel';

/** The slice of the page's `mediaPlayer` this uses. Nothing ad- or telemetry-related is touched. */
export type MediaPlayer = {
  seek(ms: number): void;
  play(): void;
  pause(): void;
  timeline: { info: { playheadPositionMs: number; programDurationMs: number; hasEnd: boolean } };
  continuousPlay?: { hide(): void };
};
type PlayerElement = Element & { mediaPlayer?: MediaPlayer };

/** Two samples this close are the same offset; a reload moves it by seconds. */
const AGREE_SEC = 0.05;
/**
 * How close to the end the countdown can start. It started ~100s before the end
 * of a 55-minute episode; the margin is for a longer credit roll.
 */
const UP_NEXT_WINDOW_MS = 10 * 60_000;
export const SCAN_MS = 500;
/** A seek that never reports `seeked` (one to where it already is) must not leave the offset unknown for good. */
const SETTLE_GIVE_UP_MS = 5000;

export class DisneyPage {
  private published: FromPage = { kind: 'state', offsetSec: null, durationMs: null };
  private last: number | null = null;
  /** Since when the offset has been unknown because of a seek; null when it is not. */
  private settlingSince: number | null = null;
  private suppressUpNext = false;
  private readonly wired = new WeakSet<HTMLVideoElement>();

  constructor(
    private readonly root: ParentNode,
    private readonly channel: Channel<FromPage, ToPage>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  start(every: (fn: () => void, ms: number) => void = (fn, ms) => { setInterval(fn, ms); }) {
    this.channel.listen((m) => this.onCommand(m));
    this.scan();
    every(() => this.scan(), SCAN_MS);
  }

  private player(): PlayerElement | null { return this.root.querySelector<PlayerElement>(PLAYER_SELECTOR); }
  private mediaPlayer(): MediaPlayer | null { return this.player()?.mediaPlayer ?? null; }

  /** Wire new <video>s, take a sample while paused, and keep the countdown back if asked. */
  scan() {
    const player = this.player();
    if (!player) return;
    for (const v of player.querySelectorAll('video')) {
      if (this.wired.has(v)) continue;
      this.wired.add(v);
      // Registered after the player's own listeners, so the playhead is fresh here.
      v.addEventListener('timeupdate', () => this.sample(v));
      v.addEventListener('seeking', () => { if (v === visibleVideo(player)) this.unsettle(); });
      v.addEventListener('seeked', () => { if (v === visibleVideo(player)) this.settlingSince = null; });
      // New media without a seek (the next episode, in place): the old offset is wrong from here on.
      v.addEventListener('loadstart', () => { if (v === visibleVideo(player)) { this.last = null; this.publish(null); } });
    }
    if (this.settlingSince !== null && this.now() - this.settlingSince > SETTLE_GIVE_UP_MS) this.settlingSince = null;
    // A paused video fires no timeupdates, but neither clock moves, so any moment is exact.
    const v = visibleVideo(player);
    if (v?.paused) this.sample(v);
    this.holdUpNext();
  }

  private unsettle() {
    this.settlingSince = this.now();
    this.last = null;
    this.publish(null);
  }

  private sample(v: HTMLVideoElement) {
    const player = this.player();
    const mp = player?.mediaPlayer;
    if (!player || !mp || v !== visibleVideo(player) || this.settlingSince !== null || v.seeking) return;
    const info = mp.timeline?.info;
    if (!info || !Number.isFinite(info.playheadPositionMs)) return;
    const offset = info.playheadPositionMs / 1000 - v.currentTime;
    const agreed = this.last !== null && Math.abs(offset - this.last) <= AGREE_SEC;
    this.last = offset;
    if (agreed) this.publish(offset);
  }

  private publish(offsetSec: number | null) {
    const info = this.mediaPlayer()?.timeline?.info;
    const durationMs = info && info.hasEnd && info.programDurationMs > 0 ? info.programDurationMs : null;
    const prev = this.published;
    // A held offset is re-read four times a second; only a real change goes out.
    const same = (a: number | null, b: number | null, eps: number) => (a === null || b === null ? a === b : Math.abs(a - b) <= eps);
    if (same(prev.offsetSec, offsetSec, 0.005) && same(prev.durationMs, durationMs, 1)) return;
    this.published = { kind: 'state', offsetSec, durationMs };
    this.channel.send(this.published);
  }

  private holdUpNext() {
    if (!this.suppressUpNext) return;
    const mp = this.mediaPlayer();
    const info = mp?.timeline?.info;
    if (!mp?.continuousPlay || !info?.hasEnd) return;
    if (info.programDurationMs - info.playheadPositionMs > UP_NEXT_WINDOW_MS) return;
    // Seen to cancel the countdown once (2026-11-18); not yet confirmed against a clean control.
    try { mp.continuousPlay.hide(); } catch { /* the player's to refuse */ }
  }

  private onCommand(m: ToPage) {
    const mp = this.mediaPlayer();
    switch (m.kind) {
      case 'hello':
        // A fresh facade, maybe after the content script was re-injected: tell it where things stand.
        this.channel.send(this.published);
        return;
      case 'seek':
        if (!mp) return;
        // Unsettle now rather than on `seeking`: the player may take a moment to start.
        this.unsettle();
        mp.seek(m.ms);
        return;
      case 'play': mp?.play(); return;
      case 'pause': mp?.pause(); return;
      case 'upNext':
        this.suppressUpNext = m.suppress;
        this.holdUpNext();
        return;
    }
  }
}
