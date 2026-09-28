import { describe, it, expect } from 'vitest';
import { youtubeAdapter } from '../lib/providers/youtube';

/**
 * The selectors are checked against the real page; what is pinned here is the
 * branching around them. vitest runs in node, so the page is a stand-in: a map
 * from the selectors that match something to what they match.
 */
const VIDEO = 'ytd-watch-flexy:not([hidden]) #movie_player video.html5-main-video';
const AD = 'ytd-watch-flexy:not([hidden]) #movie_player.ad-showing';

/** A <video> with media loaded, which is what `readyState` above HAVE_NOTHING means. */
const loadedVideo = () => ({ readyState: 4 }) as HTMLVideoElement;

function page(present: Record<string, unknown>) {
  const asked: string[] = [];
  const root = {
    querySelector: (sel: string) => { asked.push(sel); return present[sel] ?? null; },
  } as unknown as ParentNode;
  return { root, asked };
}

describe('the YouTube adapter', () => {
  it('finds the watch page player and lays the sidebar out around it', () => {
    const video = loadedVideo();
    const { root } = page({ [VIDEO]: video });
    expect(youtubeAdapter.findVideo(root)).toBe(video);
    expect(youtubeAdapter.findAnchor!(root)).toBe(video);
  });

  it('reports no video while an ad is playing, so the ad never drives the room', () => {
    // Ads run through the same element; withheld, VideoBinding unwires and the end
    // of the ad is a re-attach, which resyncs to the room.
    const video = loadedVideo();
    const { root } = page({ [VIDEO]: video, [AD]: {} });
    expect(youtubeAdapter.findVideo(root)).toBeNull();
    // The anchor is not gated: the sidebar should sit still across an ad break.
    expect(youtubeAdapter.findAnchor!(root)).toBe(video);
  });

  it('reports nothing while the element is empty between the ad and the content', () => {
    // `ad-showing` clears while the element still holds nothing. On the marker alone
    // the adapter hands back an element reading currentTime 0, and the restore seek
    // behind it reaches the room as a scrub.
    const empty = { readyState: 0 } as HTMLVideoElement;
    const { root } = page({ [VIDEO]: empty });
    expect(youtubeAdapter.findVideo(root)).toBeNull();
    // The anchor is still the element: the sidebar has nowhere else to go.
    expect(youtubeAdapter.findAnchor!(root)).toBe(empty);
  });

  it('finds nothing off a watch page', () => {
    // The feed leaves the player behind a hidden ytd-watch-flexy, and its hover
    // preview is a second .html5-main-video. Neither is room content.
    const { root, asked } = page({});
    expect(youtubeAdapter.findVideo(root)).toBeNull();
    expect(youtubeAdapter.findAnchor!(root)).toBeNull();
    for (const sel of asked) expect(sel.startsWith('ytd-watch-flexy:not([hidden])')).toBe(true);
  });
});
