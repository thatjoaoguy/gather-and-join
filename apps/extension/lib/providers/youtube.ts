import type { PlayerAdapter } from './player-adapter';

/**
 * YouTube (inspected 2026-09-19, `/watch?v=`): a real `<video>` in the top
 * document, but a bare `querySelector('video')` gets it wrong twice.
 *
 *  1. The home feed's hover preview is a *second* `video.html5-main-video`,
 *     inside `#inline-preview-player`. Scoping to `#movie_player` excludes it.
 *  2. YouTube routes client-side, and routing away from a watch page leaves
 *     `#movie_player` in the DOM with its video still attached — inside a
 *     `ytd-watch-flexy` that has gone `hidden`. Off a watch page there should
 *     be no element at all (the sidebar would otherwise mount over the home
 *     feed), hence the `:not([hidden])` scope. Attribute matching rather than
 *     `offsetParent`: this runs on every DOM mutation and YouTube mutates
 *     constantly, so it must not force layout.
 *
 * Ads play through that same element. Reported unguarded, the ad's timeline is
 * what the room hears: one viewer's pre-roll seeks everybody into it, and they
 * are yanked back when it ends. So while the player carries `ad-showing` this
 * adapter reports no video at all — VideoBinding unwires, nothing is broadcast
 * and no correction is applied, and the end of the ad arrives as a re-attach,
 * which is already the path that resyncs a fresh element to the room. Nothing
 * touches the ad itself; it is only ignored.
 *
 * `ad-showing` is YouTube's own marker (`.html5-video-player.ad-showing` is a
 * live rule in its stylesheet, and `#movie_player` carries that class). If it
 * is ever renamed the gate stops firing and sync goes back to fighting over ad
 * breaks — degraded, not broken.
 */
const PLAYER = 'ytd-watch-flexy:not([hidden]) #movie_player';
const MAIN_VIDEO = `${PLAYER} video.html5-main-video`;

const findAnchor = (root: ParentNode) => root.querySelector<HTMLVideoElement>(MAIN_VIDEO);
const adShowing = (root: ParentNode) => !!root.querySelector(`${PLAYER}.ad-showing`);

/**
 * Autoplay-next: `.ytp-autonav-endscreen-countdown-overlay` is an always-present
 * child of the player, `display:none` until the video is nearly over, when it
 * counts down to the next video and takes the tab there. Its own "Cancel"
 * (`.ytp-autonav-endscreen-upnext-cancel-button`) lives inside it.
 */
export const youtubeAdapter: PlayerAdapter = {
  providerId: 'youtube',
  findVideo: (root) => (adShowing(root) ? null : findAnchor(root)),
  // Not gated on the ad: the anchor is what the sidebar lays out around, and it
  // should stay put across an ad break rather than remount on either side of it.
  findAnchor,
  upNext: {
    panel: ['.ytp-autonav-endscreen-countdown-overlay'],
    dismiss: ['.ytp-autonav-endscreen-upnext-cancel-button'],
  },
};
