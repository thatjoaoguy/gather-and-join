/**
 * A <video>-shaped facade over a cross-origin YouTube embed.
 *
 * Google Drive plays video in an iframe on youtube.googleapis.com, so there is
 * no element to bind: the only way in is the YouTube widget postMessage
 * protocol. This class exposes the slice of HTMLVideoElement that VideoBinding,
 * SyncEngine and Ducker actually use (currentTime, paused, readyState,
 * playbackRate, volume, play/pause, events) on top of that protocol, so none of
 * them need to know which substrate they are driving.
 *
 * Observed properties of the real embed (2026-09-19, Drive file view):
 *  - a `listening` handshake answers `alreadyInitialized` — Drive's own script
 *    owns the widget channel — but commands are honoured regardless;
 *  - `infoDelivery` is broadcast to the parent every ~266ms (median 266, max
 *    277) carrying currentTime, playerState, playbackRate and duration.
 *
 * That cadence is far coarser than the frame-accurate reads SyncEngine gets
 * from a real element, so position is dead-reckoned from the last tick using
 * the local clock and the known rate. Between ticks the estimate is as good as
 * the clock; at a tick it is corrected. The error that matters is therefore
 * tick latency, not tick spacing.
 */

/** YouTube player states. */
const UNSTARTED = -1, ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3;

type Info = { currentTime?: number; playerState?: number; playbackRate?: number; duration?: number };

export class YtEmbedMedia extends EventTarget {
  /** Last position reported by the player, and the local clock reading when it arrived. */
  private tickSec = 0;
  private tickWall = 0;
  private state = UNSTARTED;
  private rate = 1;
  private vol = 1;
  private durationSec = 0;
  private everPlayed = false;
  /** Set on a local seek so the estimate jumps immediately instead of waiting a tick. */
  private onMessage: (e: MessageEvent) => void;

  readonly dataset: Record<string, string> = {};

  constructor(
    private readonly frame: HTMLIFrameElement,
    /** Origin to post commands to; derived from the frame's own src. */
    private readonly origin: string,
  ) {
    super();
    this.tickWall = performance.now();
    this.onMessage = (e: MessageEvent) => this.receive(e);
    window.addEventListener('message', this.onMessage);
    // Ask to be subscribed. The real player usually answers `alreadyInitialized`
    // because Drive got there first; it broadcasts to the parent either way.
    this.send('listening');
  }

  destroy() {
    window.removeEventListener('message', this.onMessage);
  }

  /** The element the page lays out, for the sidebar's benefit. */
  get element(): HTMLIFrameElement { return this.frame; }

  get isConnected(): boolean { return this.frame.isConnected; }

  // --- the HTMLVideoElement slice -----------------------------------------

  get currentTime(): number {
    if (this.state !== PLAYING) return this.tickSec;
    return this.tickSec + ((performance.now() - this.tickWall) / 1000) * this.rate;
  }
  set currentTime(sec: number) {
    // Optimistic: move the estimate now, confirm on the next tick. Waiting a
    // tick would make every corrective seek look like it overshot.
    this.tickSec = sec;
    this.tickWall = performance.now();
    this.command('seekTo', [sec, true]);
    this.dispatchEvent(new Event('seeking'));
  }

  get paused(): boolean { return this.state !== PLAYING && this.state !== BUFFERING; }

  get playbackRate(): number { return this.rate; }
  set playbackRate(r: number) {
    if (r === this.rate) return;
    // Re-base before changing rate: elapsed time so far accrued at the old one.
    this.tickSec = this.currentTime;
    this.tickWall = performance.now();
    this.rate = r;
    this.command('setPlaybackRate', [r]);
  }

  get volume(): number { return this.vol; }
  set volume(v: number) {
    this.vol = v;
    this.command('setVolume', [Math.round(v * 100)]);
  }

  /** Coarse but sufficient: SyncEngine only asks "is it starved?". */
  get readyState(): number {
    if (this.state === BUFFERING) return 1;
    return this.everPlayed || this.state === PAUSED ? 4 : 0;
  }

  get duration(): number { return this.durationSec; }

  play(): Promise<void> { this.command('playVideo'); return Promise.resolve(); }
  pause(): void { this.command('pauseVideo'); }

  // --- protocol ------------------------------------------------------------

  private send(event: string, extra: Record<string, unknown> = {}) {
    this.frame.contentWindow?.postMessage(JSON.stringify({ event, id: 1, channel: 'widget', ...extra }), this.origin);
  }

  private command(func: string, args: unknown[] = []) {
    this.send('command', { func, args });
  }

  private receive(e: MessageEvent) {
    if (e.source !== this.frame.contentWindow) return;
    let d: unknown = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
    if (!d || typeof d !== 'object') return;
    const msg = d as { event?: string; info?: Info };
    if (msg.event !== 'infoDelivery' || !msg.info) return;
    this.apply(msg.info);
  }

  private apply(info: Info) {
    if (typeof info.playbackRate === 'number') this.rate = info.playbackRate;
    if (typeof info.duration === 'number' && info.duration > 0) this.durationSec = info.duration;
    if (typeof info.currentTime === 'number') {
      this.tickSec = info.currentTime;
      this.tickWall = performance.now();
    }
    // playerState is not carried on every infoDelivery; only act when it is.
    if (typeof info.playerState === 'number' && info.playerState !== this.state) {
      const prev = this.state;
      this.state = info.playerState;
      this.emitFor(prev, info.playerState);
    }
  }

  private emitFor(prev: number, next: number) {
    if (next === PLAYING) {
      this.everPlayed = true;
      if (prev !== PLAYING) this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
      return;
    }
    if (next === PAUSED) { this.dispatchEvent(new Event('pause')); return; }
    if (next === BUFFERING) { this.dispatchEvent(new Event('waiting')); return; }
    if (next === ENDED) { this.dispatchEvent(new Event('ended')); return; }
  }
}

/** The embed iframe on a page, or null. Matched by origin so a Drive page's other iframes are ignored. */
export function findEmbedFrame(root: ParentNode, originMatch: (origin: string) => boolean): HTMLIFrameElement | null {
  for (const f of root.querySelectorAll('iframe')) {
    const src = f.getAttribute('src');
    if (!src) continue;
    try { if (originMatch(new URL(src, location.href).origin)) return f; } catch { /* not a URL */ }
  }
  return null;
}

/**
 * A findVideo/findAnchor pair for a provider whose player is an embed iframe.
 *
 * The facade is memoised per iframe: VideoBinding treats a different object as
 * a recreated element and re-wires, so handing back a fresh one each scan would
 * look like a re-attach storm on every DOM mutation.
 */
export function embedMedia(originMatch: (origin: string) => boolean) {
  let frame: HTMLIFrameElement | null = null;
  let media: YtEmbedMedia | null = null;

  const anchor = (root: ParentNode): HTMLIFrameElement | null => {
    const found = findEmbedFrame(root, originMatch);
    if (found !== frame) {
      media?.destroy();
      media = null;
      frame = found;
    }
    return frame;
  };

  return {
    findAnchor: anchor,
    findVideo: (root: ParentNode): HTMLVideoElement | null => {
      const f = anchor(root);
      if (!f) return null;
      if (!media) media = new YtEmbedMedia(f, new URL(f.src, location.href).origin);
      // Structurally the slice of HTMLVideoElement its consumers touch; see the class doc.
      return media as unknown as HTMLVideoElement;
    },
  };
}
