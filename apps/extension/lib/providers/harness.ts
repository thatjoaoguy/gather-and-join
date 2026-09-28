import { queryVideo, type PlayerAdapter } from './player-adapter';
import { embedMedia } from './yt-embed-media';

/**
 * The fake player in `tools/harness/player` serves three shapes on one host:
 * `/watch/...` mirrors HBO Max (a real <video> in the top document),
 * `/drivewatch/...` mirrors Google Drive (no <video>; a cross-origin iframe on
 * 127.0.0.1 speaking the YouTube widget protocol), and `/ytwatch/...` mirrors
 * YouTube (a real <video> whose ad break reuses that same element). Which one a
 * page is decides itself by what is in the DOM, so one adapter covers all three.
 *
 * The upNext selectors below are byte-identical to hbomax.ts on purpose, and the
 * ad marker to youtube.ts, and neither must be hoisted into a shared constant.
 * This adapter's job is to imitate those sites; if both ends read one constant
 * then the day the site changes its markup, the fixture changes with it, the
 * suite keeps passing, and production breaks silently. The duplication is what
 * keeps the fake honest about the real.
 */
const embed = embedMedia((origin) => origin !== location.origin);
/** `#movie_player` is what makes a page the YouTube-shaped one, as on the real site. */
const ytShaped = (root: ParentNode) => !!root.querySelector('#movie_player');
const adShowing = (root: ParentNode) => !!root.querySelector('#movie_player.ad-showing');
const loaded = (v: HTMLVideoElement | null) => (v && v.readyState > 0 ? v : null);

export const harnessAdapter: PlayerAdapter = {
  providerId: 'harness',
  // The YouTube shape's gate, scoped to that shape so HBO and Drive answer unchanged:
  // the marker while an ad runs, and metadata for the gap after it clears.
  findVideo: (root) => {
    const v = queryVideo(root);
    if (ytShaped(root)) return adShowing(root) ? null : loaded(v);
    return v ?? embed.findVideo(root);
  },
  findAnchor: (root) => queryVideo(root) ?? embed.findAnchor(root),
  upNext: { panel: ['[data-testid="up_next"]'], dismiss: ['[data-testid="player-ux-up-next-dismiss"]'] },
};
