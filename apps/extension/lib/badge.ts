/**
 * The room connection as the toolbar icon shows it: a coloured dot on the mark
 * while you are in a room, the plain mark when you are not. The words live in
 * the tooltip.
 *
 * The dot is drawn *into* the icon rather than set as a badge, because
 * `chrome.action.setBadgeText` is not a drawing API — Chrome draws a rounded
 * rectangle sized to the text, and neither its shape nor its padding can be
 * changed. At a 16px icon that slab covers the whole corner. Compositing the
 * mark with a circle costs a canvas and gives us the dot we actually want.
 *
 * Split in two because the halves cannot live in the same context. Only the
 * service worker may call `chrome.action`; the state it describes belongs to the
 * offscreen document, which has `chrome.runtime` and nothing else. So the
 * offscreen side reports a `BadgeState` (see `BadgeReporter`) and the worker
 * paints it (see `applyBadge`).
 */
import type { Snapshot } from './messages';

export type BadgeState = 'idle' | 'joining' | 'connected' | 'reconnecting';

/** What the snapshot has to say about the connection. */
export type ConnectionFacts = Pick<Snapshot, 'room' | 'socket' | 'joining'>;

// docs/design-system tokens: --success and --warning.
const SUCCESS = '#86d6b0';
const WARNING = '#f2c66d';

/**
 * `color: null` means the plain mark and no tooltip of our own — the tooltip
 * falls back to the extension's name, which is what "not in a room" should read as.
 */
export const BADGE_LOOKS: Record<BadgeState, { color: string | null; label: string | null }> = {
  idle: { color: null, label: null },
  joining: { color: WARNING, label: 'Joining…' },
  connected: { color: SUCCESS, label: 'Connected' },
  reconnecting: { color: WARNING, label: 'Reconnecting…' },
};

export function badgeStateFrom(s: ConnectionFacts): BadgeState {
  // A join in flight has no room yet, so it is checked first.
  if (s.joining) return 'joining';
  if (!s.room) return 'idle';
  return s.socket === 'connected' ? 'connected' : 'reconnecting';
}

// ---- drawing ---------------------------------------------------------------

/**
 * Where the dot sits, for an icon of `size` device pixels. `hole` is the
 * transparent gap punched around it, which is what separates the dot from the
 * mark underneath and from the toolbar, whatever colour that toolbar is.
 */
export function dotGeometry(size: number): { cx: number; cy: number; r: number; hole: number } {
  const r = size * 0.24;
  const hole = r + size * 0.07;
  // Tucked into the bottom-right corner, gap included, so nothing clips.
  const c = size - hole;
  return { cx: c, cy: c, r, hole };
}

/** The 2D context members used here; an `OffscreenCanvas` context satisfies it. */
export type Ctx = {
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  beginPath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalCompositeOperation: GlobalCompositeOperation;
};

const circle = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

export function drawDot(ctx: Ctx, size: number, color: string): void {
  const { cx, cy, r, hole } = dotGeometry(size);
  // Punch the gap out of the mark first. A drawn ring would need the toolbar's
  // colour, which an extension cannot know and which changes with the theme.
  ctx.globalCompositeOperation = 'destination-out';
  circle(ctx, cx, cy, hole);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  circle(ctx, cx, cy, r);
}

/** Everything the worker lends this module to draw with, so it runs under vitest. */
export type IconDeps = {
  /** The sizes Chrome asks for: 16 at 1x, 32 at 2x. */
  sizes: readonly number[];
  /** The undotted icon, per size, for the states that want the plain mark. */
  paths: Record<string, string>;
  surface: (size: number) => { getContext(id: '2d'): Ctx | null };
  base: (size: number) => Promise<CanvasImageSource>;
};

export async function dottedIcon(icons: IconDeps, color: string): Promise<Record<number, ImageData>> {
  const out: Record<number, ImageData> = {};
  for (const size of icons.sizes) {
    const ctx = icons.surface(size).getContext('2d');
    if (!ctx) throw new Error(`no 2d context for a ${size}px icon`);
    ctx.drawImage(await icons.base(size), 0, 0, size, size);
    drawDot(ctx, size, color);
    out[size] = ctx.getImageData(0, 0, size, size);
  }
  return out;
}

// ---- painting --------------------------------------------------------------

/** The slice of `chrome.action` the worker needs, so this runs under vitest with a fake. */
export type ActionApi = {
  // One or the other, never both optional: that is the shape chrome.action.setIcon takes.
  setIcon(d: { imageData: Record<number, ImageData> } | { path: Record<string, string> }): Promise<void> | void;
  setTitle(d: { title: string }): Promise<void> | void;
  /** Only to clear a badge left by an older build; nothing here sets one. */
  setBadgeText(d: { text: string }): Promise<void> | void;
};

/** `name` is the extension's own, so a test build's tooltip says so too. */
export async function applyBadge(action: ActionApi, state: BadgeState, deps: { name: string; icons: IconDeps }): Promise<void> {
  const look = BADGE_LOOKS[state];
  await action.setBadgeText({ text: '' });
  await action.setIcon(look.color ? { imageData: await dottedIcon(deps.icons, look.color) } : { path: deps.icons.paths });
  await action.setTitle({ title: look.label ? `${deps.name} · ${look.label}` : '' });
}

/**
 * Reports the state to the service worker, and only when it changes. The snapshot
 * fires on every speaking flip and every drift correction; each report wakes a
 * worker that would otherwise be asleep.
 */
export class BadgeReporter {
  private last: BadgeState | null = null;

  constructor(private readonly send: (state: BadgeState) => void) {}

  update(s: ConnectionFacts): void {
    const next = badgeStateFrom(s);
    if (next === this.last) return;
    this.last = next;
    this.send(next);
  }
}
