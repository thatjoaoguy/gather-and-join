import { disneyplus } from '@gj/shared';
import type { PlayerAdapter } from './player-adapter';
import { disneyMedia } from './disney-media';
import { domChannel, FROM_PAGE, TO_PAGE } from './disney-channel';
import type { MainWorldScript } from '../messages';

/**
 * Disney+ (inspected 2026-11-18 in Chrome on an ad-free account: Rivals S1, and a
 * series badged as live).
 *
 * - Watch pages are `/play/<uuid>` with a `?contextId=`, one uuid per episode;
 *   no locale segment was seen. The home and details pages play trailers in
 *   <video>s of their own, so nothing is reported off a watch page.
 * - `disney-web-player` holds two <video>s in its light DOM, under
 *   `.btm-media-client > .media-element-container`: one `display:none` and empty
 *   (first in document order), one playing. Neither was swapped during seeks or
 *   an episode change, but only the visible one is ever read.
 * - The element's clock is not the program's: `currentTime` restarts near 20s on
 *   every seek and was 20s off before any; `duration` is the end of what is
 *   loaded (MSE), growing in ~8s steps, Infinity on the live-badged title; and
 *   `seekable` ends ~11s ahead, so a `currentTime` write further on is clamped.
 *   The program's clock is on the element's page-world `mediaPlayer`, which a
 *   content script cannot see, hence the facade (disney-media.ts) and its
 *   page-world half (disney-page.ts), injected on demand by the worker.
 * - `mediaPlayer.seek(ms)` reaches anywhere; play, pause and a `playbackRate`
 *   written to the visible element all hold.
 * - Autoplay-next: from inside the credits (~100s before the end) the player
 *   moved on after its 5s countdown (`continuousPlay.countdownMs`), in place, by
 *   `history.replaceState`; the `up-next-lite` element stayed `hidden`
 *   throughout, so there is no panel to hide. `continuousPlay.hide()` is what
 *   followers get instead (see disney-page.ts).
 * - The controls, title and subtitles (`disney-web-player-ui`, with
 *   `timed-text-override-region` inside it) sit in a fixed layer of their own,
 *   beside the video's rather than around it, so the sidebar is told about it
 *   (findOverlays) or they stay full width under it. Two more full-width fixed
 *   layers are plain black backdrops, harmless under the sidebar, and carry only
 *   generated class names, so they are left alone.
 *
 * Not yet seen: ad breaks on the ad-supported plan. Nothing here touches them,
 * and nothing gates on them either; if they play in the same element on the
 * program's clock, the room drifts for that viewer until the break ends.
 */
const BRIDGE: MainWorldScript = 'disney';
/** The player's controls and subtitles, in a layer of their own. */
const PLAYER_UI = 'disney-web-player-ui';

export const onDisneyWatchPage = (href: string) => {
  try { return disneyplus.parseContentId(new URL(href)) !== null; } catch { return false; }
};

const media = disneyMedia({
  channel: () => domChannel(document, TO_PAGE, FROM_PAGE),
  requestBridge: () => { void chrome.runtime.sendMessage({ target: 'background', type: 'mainWorld', script: BRIDGE }).catch(() => {}); },
});

export const disneyplusAdapter: PlayerAdapter = {
  providerId: 'disneyplus',
  findVideo: (root) => (onDisneyWatchPage(location.href) ? media.findVideo(root) : null),
  findAnchor: (root) => (onDisneyWatchPage(location.href) ? media.findAnchor(root) : null),
  findOverlays: (root) => {
    const ui = onDisneyWatchPage(location.href) ? root.querySelector<HTMLElement>(PLAYER_UI) : null;
    return ui ? [ui] : [];
  },
  onChange: media.onChange,
  suppressUpNext: media.suppressUpNext,
  upNext: { panel: [], dismiss: [] },
};
