/**
 * Makes room for the sidebar without covering the player. Two modes:
 *  - page mode: narrow <html> (flow layouts) and, above it, the layer the
 *    player sits in when that layer is laid out against the viewport rather
 *    than against <html>. No transforms: a transformed <html> interferes with
 *    fullscreen.
 *  - fullscreen mode: the fullscreen element cannot be resized, but its
 *    children can; narrow every child except the sidebar host. Players
 *    re-render these, so callers re-apply it and it is idempotent.
 *
 * Both modes also look for a viewport-anchored layer, which a site can put either
 * side of the fullscreen element: fullscreen taken on <html> leaves <body> as the
 * only child to narrow, and an app layer need not sit in its flow.
 */
export const SIDEBAR_WIDTH = 240;

/** The inline properties narrowing overrides, and where each one's own value is kept meanwhile. */
const SAVED = [
  ['width', 'gjPrevWidth', 'gjPrevWidthPriority'],
  ['min-width', 'gjPrevMinWidth', 'gjPrevMinWidthPriority'],
] as const;

/**
 * The width `el`'s percentage width resolves against. For an absolutely positioned
 * element with no positioned ancestor, `offsetParent` reports <body>, but the box
 * is the initial containing block, which is the viewport. <html>'s own box is
 * measured rather than read from `clientWidth`, which reports the viewport there.
 */
function containingWidth(el: HTMLElement): number {
  const doc = el.ownerDocument;
  const viewport = doc.documentElement.clientWidth;
  const inner = (box: HTMLElement) => (box === doc.documentElement ? box.getBoundingClientRect().width : box.clientWidth);
  const position = getComputedStyle(el).position;
  if (position === 'fixed' || !el.parentElement) return viewport;
  if (position !== 'absolute') return inner(el.parentElement);
  const op = el.offsetParent as HTMLElement | null;
  if (!op || (op === doc.body && getComputedStyle(op).position === 'static')) return viewport;
  return inner(op);
}

/**
 * Narrow an element to fit beside the sidebar, remembering its own inline width
 * and min-width so they can be put back exactly. Idempotent, and called again
 * on every poll: a site that lays itself out again (Wix Video, on leaving
 * fullscreen) writes its own widths over ours, and those become the ones to put
 * back.
 *
 * An element whose containing block already fits only needs to fill it: another
 * `- SIDEBAR_WIDTH` would take the sidebar's width twice. That is the case for a
 * player that sizes itself to the window in inline pixels, as Wix Video does,
 * inside a <html> already narrowed. Such a player also pins its min-width to the
 * window, which would hold it open whatever its width says.
 */
function narrow(el: HTMLElement, tag: string): boolean {
  const ours = el.dataset.gjShrunk;
  if (ours && ours !== tag) return false;
  // Ours is the only `!important` there: a site's write over it drops the priority.
  const overwritten = SAVED.filter(([prop]) => !ours || el.style.getPropertyPriority(prop) !== 'important');
  if (!overwritten.length) return true;
  const fits = containingWidth(el) <= el.ownerDocument.documentElement.clientWidth - SIDEBAR_WIDTH + 1;
  el.dataset.gjShrunk = tag;
  for (const [prop, value, priority] of overwritten) {
    el.dataset[value] = el.style.getPropertyValue(prop);
    el.dataset[priority] = el.style.getPropertyPriority(prop);
  }
  el.style.setProperty('width', fits ? '100%' : `calc(100% - ${SIDEBAR_WIDTH}px)`, 'important');
  el.style.setProperty('min-width', '0', 'important');
  return true;
}
function restore(el: HTMLElement) {
  if (!el.dataset.gjShrunk) return;
  for (const [prop, value, priority] of SAVED) {
    const prev = el.dataset[value] ?? '';
    if (prev) el.style.setProperty(prop, prev, el.dataset[priority] ?? ''); else el.style.removeProperty(prop);
    delete el.dataset[value]; delete el.dataset[priority];
  }
  delete el.dataset.gjShrunk;
}

export class PageLayout {
  private pageShrunk = false;
  private shrunk: HTMLElement[] = [];

  constructor(
    private readonly findAnchor: (root: ParentNode) => HTMLElement | null,
    private readonly doc: Document = document,
  ) {}

  /** Page mode on/off. */
  shrinkPage(on: boolean) {
    if (on === this.pageShrunk) return;
    this.pageShrunk = on;
    if (on) {
      this.shrunk = [this.doc.documentElement];
      narrow(this.doc.documentElement, '1');
      this.refreshPage();
    } else {
      for (const t of this.shrunk) restore(t);
      this.shrunk = [];
    }
  }

  /**
   * Players render (and re-render) their player layer after the page has loaded,
   * often after the sidebar mounted: arriving at an episode from another page, or
   * a client-side route to the next one. Called on every poll while in page mode,
   * so the layer is narrowed as soon as it exists.
   */
  refreshPage() {
    if (!this.pageShrunk) return;
    this.shrunk = this.shrunk.filter((t) => t.isConnected);
    for (const t of this.shrunk) narrow(t, '1');
    const layer = this.wideLayer(this.doc.documentElement);
    if (layer && !this.shrunk.includes(layer) && narrow(layer, '1')) this.shrunk.push(layer);
  }

  /**
   * The width a layer has to fit into. `documentElement.clientWidth` is the viewport
   * rather than the root's own box, which is what `calc(100% - SIDEBAR_WIDTH)`
   * resolves against and does not change when <html> is narrowed.
   */
  private available(): number {
    return this.doc.documentElement.clientWidth - SIDEBAR_WIDTH;
  }

  /**
   * The outermost ancestor of the player still too wide to fit beside the sidebar.
   *
   * Narrowing <html> is enough for a layout in flow, but not for a player inside a
   * layer laid out against the viewport: a position:fixed inset:0 wrapper, or an
   * absolutely positioned app root whose containing block is the initial one. Found
   * by measuring rather than by testing `position`, since both produce it. Outermost
   * and one only — a site that recomputes inner widths asynchronously reports stale
   * ones to a walk that keeps going.
   */
  private wideLayer(limit: HTMLElement): HTMLElement | null {
    const chain: HTMLElement[] = [];
    for (let el = this.findAnchor(this.doc); el && el !== limit; el = el.parentElement) chain.unshift(el);
    const available = this.available();
    // +1 to stay clear of sub-pixel widths; a layer one pixel over is not the problem.
    return chain.find((el) => el.getBoundingClientRect().width > available + 1) ?? null;
  }

  /** Fullscreen mode: narrow `fs`'s children except `except`; `null` restores what fullscreen mode narrowed. */
  shrinkFullscreenChildren(fs: HTMLElement | null, except: Element | null) {
    if (!fs) {
      this.doc.querySelectorAll<HTMLElement>('[data-gj-shrunk="fs"]').forEach(restore);
      return;
    }
    for (const child of fs.children) {
      if (child === except || !(child instanceof HTMLElement)) continue;
      narrow(child, 'fs');
    }
    // Not enough when a child is only an ancestor of the player on paper: <body> is,
    // and an absolutely positioned app layer inside it ignores its width.
    const layer = this.wideLayer(fs);
    if (layer && layer !== except) narrow(layer, 'fs');
  }

  restoreAll() {
    this.shrinkPage(false);
    this.shrinkFullscreenChildren(null, null);
  }
}
