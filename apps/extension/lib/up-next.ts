/**
 * Autoplay-next suppression. Non-leaders must not wander ahead of the room, so
 * on their pages the provider's up-next panel is hidden and its dismiss button
 * clicked (once per button). The leader's transition is what moves the room.
 */
export type UpNextSelectors = { readonly panel: readonly string[]; readonly dismiss: readonly string[] };

export class UpNextSuppressor {
  private observer: MutationObserver | null = null;
  private suppress = false;

  constructor(private readonly selectors: UpNextSelectors, private readonly root: Document = document) {}

  /** Apply (or lift) suppression now and keep applying it as the player re-renders. */
  set(suppress: boolean) {
    this.suppress = suppress;
    this.apply();
    if (!this.observer) {
      this.observer = new MutationObserver(() => { if (this.suppress) this.apply(); });
      this.observer.observe(this.root.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    }
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    this.suppress = false;
    this.apply();
  }

  private apply() {
    for (const sel of this.selectors.panel) {
      this.root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (this.suppress) {
          for (const d of this.selectors.dismiss) el.querySelectorAll<HTMLElement>(d).forEach((b) => { if (!b.dataset.gjDismissed) { b.dataset.gjDismissed = '1'; b.click(); } });
          el.dataset.gjHidden = '1';
          el.style.setProperty('display', 'none', 'important');
        } else if (el.dataset.gjHidden) {
          delete el.dataset.gjHidden;
          el.style.removeProperty('display');
        }
      });
    }
  }
}
