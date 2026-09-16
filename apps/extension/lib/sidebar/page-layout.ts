/**
 * Makes room for the sidebar without covering the player. Two modes:
 *  - page mode: narrow <html> (flow layouts) and the video's nearest
 *    position:fixed ancestor (HBO Max wraps its player in a fixed, inset:0
 *    layer that ignores the html width). No transforms: a transformed <html>
 *    interferes with fullscreen.
 *  - fullscreen mode: the fullscreen element cannot be resized, but its
 *    children can; narrow every child except the sidebar host. Players
 *    re-render these, so callers re-apply it and it is idempotent.
 */
export const SIDEBAR_WIDTH = 240;

/** Narrow an element by the sidebar width, remembering its own inline width so it can be put back exactly. */
function narrow(el: HTMLElement, tag: string): boolean {
  if (el.dataset.gajShrunk) return el.dataset.gajShrunk === tag;
  el.dataset.gajShrunk = tag;
  el.dataset.gajPrevWidth = el.style.getPropertyValue('width');
  el.dataset.gajPrevWidthPriority = el.style.getPropertyPriority('width');
  el.style.setProperty('width', `calc(100% - ${SIDEBAR_WIDTH}px)`, 'important');
  return true;
}
function restore(el: HTMLElement) {
  if (!el.dataset.gajShrunk) return;
  const prev = el.dataset.gajPrevWidth ?? '';
  if (prev) el.style.setProperty('width', prev, el.dataset.gajPrevWidthPriority ?? ''); else el.style.removeProperty('width');
  delete el.dataset.gajShrunk; delete el.dataset.gajPrevWidth; delete el.dataset.gajPrevWidthPriority;
}

export class PageLayout {
  private pageShrunk = false;
  private shrunk: HTMLElement[] = [];

  constructor(
    private readonly findVideo: (root: ParentNode) => HTMLVideoElement | null,
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
   * Players render (and re-render) their fixed player layer after the page has
   * loaded, often after the sidebar mounted: arriving at an episode from another
   * page, or a client-side route to the next one. Called on every poll while in
   * page mode, so the layer is narrowed as soon as it exists.
   */
  refreshPage() {
    if (!this.pageShrunk) return;
    this.shrunk = this.shrunk.filter((t) => t.isConnected);
    const layer = this.fixedLayer();
    if (layer && !this.shrunk.includes(layer) && narrow(layer, '1')) this.shrunk.push(layer);
  }

  /** The nearest position:fixed ancestor of the player's video, if any. */
  private fixedLayer(): HTMLElement | null {
    let el: HTMLElement | null = this.findVideo(this.doc);
    while (el && el !== this.doc.documentElement) {
      if (getComputedStyle(el).position === 'fixed') return el;
      el = el.parentElement;
    }
    return null;
  }

  /** Fullscreen mode: narrow `fs`'s children except `except`; `null` restores what fullscreen mode narrowed. */
  shrinkFullscreenChildren(fs: HTMLElement | null, except: Element | null) {
    if (!fs) {
      this.doc.querySelectorAll<HTMLElement>('[data-gaj-shrunk="fs"]').forEach(restore);
      return;
    }
    for (const child of fs.children) {
      if (child === except || !(child instanceof HTMLElement) || child.dataset.gajShrunk) continue;
      narrow(child, 'fs');
    }
  }

  restoreAll() {
    this.shrinkPage(false);
    this.shrinkFullscreenChildren(null, null);
  }
}
