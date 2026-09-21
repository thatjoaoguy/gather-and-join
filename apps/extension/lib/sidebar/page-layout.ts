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

/** Narrow an element by the sidebar width, remembering its own inline width so it can be put back exactly. */
function narrow(el: HTMLElement, tag: string): boolean {
  if (el.dataset.gjShrunk) return el.dataset.gjShrunk === tag;
  el.dataset.gjShrunk = tag;
  el.dataset.gjPrevWidth = el.style.getPropertyValue('width');
  el.dataset.gjPrevWidthPriority = el.style.getPropertyPriority('width');
  el.style.setProperty('width', `calc(100% - ${SIDEBAR_WIDTH}px)`, 'important');
  return true;
}
function restore(el: HTMLElement) {
  if (!el.dataset.gjShrunk) return;
  const prev = el.dataset.gjPrevWidth ?? '';
  if (prev) el.style.setProperty('width', prev, el.dataset.gjPrevWidthPriority ?? ''); else el.style.removeProperty('width');
  delete el.dataset.gjShrunk; delete el.dataset.gjPrevWidth; delete el.dataset.gjPrevWidthPriority;
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
      if (child === except || !(child instanceof HTMLElement) || child.dataset.gjShrunk) continue;
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
