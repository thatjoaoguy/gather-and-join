/**
 * The wire between the two halves of the Disney+ adapter.
 *
 * The position that means anything lives on the page's own `mediaPlayer`, a
 * property a content script's isolated world cannot see (see disneyplus.ts), so
 * a script in the page's world reads it (disney-page.ts) and the content script
 * drives the <video>-shaped facade (disney-media.ts) from what it says.
 *
 * DOM events rather than postMessage: dispatch is synchronous across worlds, so
 * a command has reached the player by the time `dispatchEvent` returns and the
 * facade never reads a state older than its own last command. `detail` is a JSON
 * string because Firefox does not hand a page's objects to a content script.
 *
 * Anything on the page can send these too. That buys it nothing: it could call
 * `mediaPlayer` itself, and the facade only ever learns positions from them.
 */
export const TO_PAGE = 'gj:disney:command';
export const FROM_PAGE = 'gj:disney:state';

export type ToPage =
  /** A facade has started and wants the current state. */
  | { kind: 'hello' }
  | { kind: 'seek'; ms: number }
  | { kind: 'play' }
  | { kind: 'pause' }
  /** Keep the next-episode countdown from moving this viewer on (everyone but the leader). */
  | { kind: 'upNext'; suppress: boolean };

/**
 * `offsetSec` maps the visible <video>'s clock onto the program's: program
 * position = `video.currentTime + offsetSec`. It holds until the player reloads
 * its media, which every seek does. Null until the page has a sample it trusts.
 */
export type FromPage = { kind: 'state'; offsetSec: number | null; durationMs: number | null };

/** The player element. Both halves find it the same way; only the page's world sees its `mediaPlayer`. */
export const PLAYER_SELECTOR = 'disney-web-player';

/**
 * The <video> that is playing. The player keeps two, one of them `display:none`
 * and empty, and the hidden one comes first: a plain `querySelector('video')`
 * gets the wrong one.
 */
export function visibleVideo(player: ParentNode): HTMLVideoElement | null {
  for (const v of player.querySelectorAll('video')) if (v.style.display !== 'none') return v;
  return null;
}

export type Channel<Out, In> = { send(msg: Out): void; listen(fn: (msg: In) => void): () => void };

/** The channel over `doc`'s events, from either side: `out` is the event this side sends. */
export function domChannel<Out, In>(doc: Document, out: string, inbound: string): Channel<Out, In> {
  return {
    send: (msg) => { doc.dispatchEvent(new CustomEvent(out, { detail: JSON.stringify(msg) })); },
    listen(fn) {
      const handler = (e: Event) => {
        const raw = (e as CustomEvent<unknown>).detail;
        if (typeof raw !== 'string') return;
        try { fn(JSON.parse(raw) as In); } catch { /* not ours */ }
      };
      doc.addEventListener(inbound, handler);
      return () => doc.removeEventListener(inbound, handler);
    },
  };
}
