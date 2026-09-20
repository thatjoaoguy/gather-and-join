import { queryVideo, type PlayerAdapter } from './player-adapter';
import { embedMedia } from './yt-embed-media';

/**
 * The fake player in `tools/harness/player` serves two shapes on one host:
 * `/watch/...` mirrors HBO Max (a real <video> in the top document), and
 * `/drivewatch/...` mirrors Google Drive (no <video>; a cross-origin iframe on
 * 127.0.0.1 speaking the YouTube widget protocol). Which one a page is decides
 * itself by what is in the DOM, so one adapter covers both.
 *
 * The upNext selectors below are byte-identical to hbomax.ts on purpose, and
 * must NOT be hoisted into a shared constant. This adapter's job is to imitate
 * HBO Max; if both read the same constant then the day HBO changes its markup,
 * the fixture changes with it, the suite keeps passing, and production breaks
 * silently. The duplication is what keeps the fake honest about the real.
 */
const embed = embedMedia((origin) => origin !== location.origin);

export const harnessAdapter: PlayerAdapter = {
  providerId: 'harness',
  findVideo: (root) => queryVideo(root) ?? embed.findVideo(root),
  findAnchor: (root) => queryVideo(root) ?? embed.findAnchor(root),
  upNext: { panel: ['[data-testid="up_next"]'], dismiss: ['[data-testid="player-ux-up-next-dismiss"]'] },
};
