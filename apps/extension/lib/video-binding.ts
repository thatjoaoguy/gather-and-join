/**
 * The single accessor for the page's <video>. The player destroys and recreates
 * the element on quality switches, ad boundaries, fullscreen toggles and episode
 * transitions; a stale reference stops emitting events silently. So: observe the
 * DOM, re-wire on every new element, never cache a handle anywhere else.
 */
import { queryVideo } from './providers/player-adapter';

export type VideoHandlers = Partial<Record<'play' | 'pause' | 'seeking' | 'seeked' | 'waiting' | 'playing' | 'ended', (v: HTMLVideoElement) => void>>;

export class VideoBinding {
  private video: HTMLVideoElement | null = null;
  private observer: MutationObserver | null = null;
  private bound: Array<[string, EventListener]> = [];
  private everAttached = false;
  /** Number of times a *replacement* element was wired (first attach is not a re-attach). */
  reattaches = 0;

  constructor(
    private readonly handlers: VideoHandlers,
    private readonly onAttach: (v: HTMLVideoElement, isReattach: boolean) => void,
    /** How to find the player's element; the provider adapter supplies this. */
    private readonly findVideo: (root: ParentNode) => HTMLVideoElement | null = queryVideo,
    /** Sabotage: never re-scan after the first attach, so a recreated element is missed. */
    private readonly sabotaged = false,
  ) {}

  start() {
    this.scan();
    if (this.sabotaged) return;
    this.observer = new MutationObserver(() => this.scan());
    // Attributes as well as the tree: an adapter's answer can turn on one (YouTube's
    // ad marker is a class, its watch page hides behind `hidden`), and those arrive
    // as attribute records only. Filtered to the two, to keep `scan` off the hot path.
    this.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    this.unwire();
    this.video = null;
  }

  /** Current element, or null if none is attached to the document. */
  get(): HTMLVideoElement | null {
    if (this.sabotaged) return this.video; // returns the stale handle, on purpose
    return this.video && this.video.isConnected ? this.video : null;
  }

  private scan() {
    const v = this.findVideo(document);
    if (v === this.video) return;
    if (!v) { this.unwire(); this.video = null; return; }
    // Detach-then-attach (quality switch) is a re-attach too, not a first attach.
    const isReattach = this.everAttached;
    this.everAttached = true;
    this.unwire();
    this.video = v;
    this.wire(v);
    if (isReattach) this.reattaches++;
    this.onAttach(v, isReattach);
  }

  private wire(v: HTMLVideoElement) {
    for (const [name, fn] of Object.entries(this.handlers)) {
      if (!fn) continue;
      const listener: EventListener = () => fn(v);
      v.addEventListener(name, listener);
      this.bound.push([name, listener]);
    }
  }

  private unwire() {
    if (!this.video) return;
    for (const [name, listener] of this.bound) this.video.removeEventListener(name, listener);
    this.bound = [];
  }
}
