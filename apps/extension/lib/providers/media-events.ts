/**
 * The event half of a <video>-shaped facade (yt-embed-media.ts, disney-media.ts):
 * addEventListener, removeEventListener and dispatchEvent, which is all VideoBinding
 * and its neighbours call.
 *
 * Not EventTarget, though it would be the obvious base. In a Firefox content script
 * EventTarget is the page's own, seen through an Xray wrapper, and an instance of a
 * class extending it is not a normal instance: events it dispatched never reached the
 * listeners the content script added, so a player's own play, pause and seeks never
 * reached the room (measured with smoke:firefox; Chrome is unaffected). A plain
 * registry behaves the same in both.
 */
type Listener = EventListenerOrEventListenerObject;

export class MediaEvents {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, fn: Listener | null) {
    if (!fn) return;
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
  }

  removeEventListener(type: string, fn: Listener | null) {
    if (fn) this.listeners.get(type)?.delete(fn);
  }

  /** As a real dispatch: every listener runs even if one throws, and the error still surfaces. */
  dispatchEvent(e: Event): boolean {
    for (const fn of [...(this.listeners.get(e.type) ?? [])]) {
      try {
        if (typeof fn === 'function') fn.call(this, e); else fn.handleEvent(e);
      } catch (err) {
        setTimeout(() => { throw err; });
      }
    }
    return !e.defaultPrevented;
  }
}
