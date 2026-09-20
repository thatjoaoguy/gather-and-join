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
 * Both modes then look for a viewport-anchored layer, because a site can put
 * one either side of the fullscreen element: YouTube calls requestFullscreen on
 * <html> itself, so narrowing "the fullscreen element's children" only reaches
 * <body>, which its app layer does not sit in the flow of.
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
   * The width a layer has to fit into. `documentElement.clientWidth` is the
   * *viewport*, not the root element's own box — the root is special-cased in
   * CSSOM — which is exactly what is wanted here and in fullscreen alike: it is
   * the width `calc(100% - SIDEBAR_WIDTH)` resolves against, scrollbar already
   * excluded, and it does not change when <html> is narrowed.
   */
  private available(): number {
    return this.doc.documentElement.clientWidth - SIDEBAR_WIDTH;
  }

  /**
   * The outermost ancestor of the player that is still too wide to fit beside
   * the sidebar, or null when everything already fits.
   *
   * Narrowing <html> is enough for a layout that is in flow. It is not when the
   * player sits in a layer laid out against the viewport instead: HBO Max wraps
   * its player in a position:fixed, inset:0 layer, and YouTube's whole app is a
   * position:absolute <ytd-app> whose containing block is the initial containing
   * block. Both stay viewport-wide while <html> shrinks underneath them.
   *
   * Chosen by measuring rather than by testing `position`, because those are two
   * different ways of producing one problem and there will be a third. Outermost,
   * and one only: narrowing it is what lets everything inside it reflow, and a
   * site that recomputes its inner widths asynchronously reports stale ones to a
   * walk that keeps going — YouTube's watch columns measure as full width for a
   * frame after their container shrinks, and narrowing those too leaves the page
   * 60px wider than it started.
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
    // Narrowing the children is not enough when one of them is only an ancestor
    // of the player on paper — YouTube fullscreens <html>, so the child reached
    // above is <body>, which its absolutely positioned app layer ignores.
    const layer = this.wideLayer(fs);
    if (layer && layer !== except) narrow(layer, 'fs');
  }

  restoreAll() {
    this.shrinkPage(false);
    this.shrinkFullscreenChildren(null, null);
  }
}
