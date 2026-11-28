import { describe, it, expect, vi, afterEach } from 'vitest';
import { YtEmbedMedia } from '../lib/providers/yt-embed-media';

/**
 * Only the event plumbing is pinned here: the facade keeps its own listener
 * registry instead of extending EventTarget (see the class), so it has to keep
 * a real dispatch's guarantees itself. vitest runs in node; the window and the
 * embed are stand-ins, and the player speaks through the captured message handler.
 */
function embed() {
  let onMessage: ((e: MessageEvent) => void) | null = null;
  vi.stubGlobal('window', { addEventListener: (_: string, fn: typeof onMessage) => { onMessage = fn; }, removeEventListener: () => {} });
  const contentWindow = { postMessage: () => {} };
  const media = new YtEmbedMedia({ contentWindow, isConnected: true } as unknown as HTMLIFrameElement, 'https://embed.test');
  const info = (i: Record<string, number>) => onMessage!({ source: contentWindow, data: JSON.stringify({ event: 'infoDelivery', info: i }) } as unknown as MessageEvent);
  const state = (playerState: number) => info({ playerState });
  return { media, state, info };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('YtEmbedMedia events', () => {
  it('delivers the player\'s state changes to listeners, with the facade as `this`', () => {
    const { media, state } = embed();
    const seen: string[] = [];
    const play = vi.fn((e: Event) => seen.push(e.type));
    media.addEventListener('play', play);
    media.addEventListener('pause', { handleEvent: (e) => seen.push(e.type) });
    state(1);
    state(2);
    expect(seen).toEqual(['play', 'pause']);
    expect(play.mock.contexts[0]).toBe(media);
  });

  it('stops delivering once a listener is removed', () => {
    const { media, state } = embed();
    const fn = vi.fn();
    media.addEventListener('pause', fn);
    state(1); state(2);
    media.removeEventListener('pause', fn);
    state(1); state(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs every listener when one throws, and still surfaces the error', () => {
    vi.useFakeTimers();
    const { media } = embed();
    const after = vi.fn();
    media.addEventListener('seeking', () => { throw new Error('boom'); });
    media.addEventListener('seeking', after);
    media.currentTime = 12;
    expect(after).toHaveBeenCalledTimes(1);
    expect(() => vi.runAllTimers()).toThrow('boom');
  });
});

describe('YtEmbedMedia buffered', () => {
  it('describes what is loaded from the embed\'s loaded fraction, and nothing until the embed has said', () => {
    const { media, info } = embed();
    expect(media.buffered).toBeUndefined();
    info({ duration: 300 });
    expect(media.buffered).toBeUndefined(); // a length but no fraction: it cannot say
    info({ videoLoadedFraction: 0.25 });
    const b = media.buffered!;
    expect([b.length, b.start(0), b.end(0)]).toEqual([1, 0, 75]);
  });
});
