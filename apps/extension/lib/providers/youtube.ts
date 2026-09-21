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
 * Ads play through that same element, and the element is *not* replaced across
 * the break, so nothing else marks the transition. Reported unguarded, the ad's
 * timeline is what the room hears: one viewer's break seeks everybody into it.
 * So this adapter reports no video for the whole break — VideoBinding unwires,
 * nothing is broadcast and no correction is applied, and the return arrives as a
 * re-attach, which is already the path that resyncs a fresh element to the room.
 * Nothing touches the ad itself; it is only ignored.
 *
 * "The whole break" is two conditions, and the second one is not obvious.
 * Measured across a live mid-roll (2026-09-20, a 38-minute video paused at
 * 25:53):
 *
 *   AD START  cur=0       dur=0         ad-showing
 *   ...       cur=10.2    dur=107       ad-showing   <- the ad's own timeline
 *   AD END    cur=0       dur=0         (marker gone, element empty)
 *   +160ms    cur=1553.6  dur=2309.1    (content back, at the viewer's position)
 *
 * YouTube clears `ad-showing` while the element still holds nothing, and puts
 * the content back a moment later — 160ms in that capture, ~800ms in another.
 * On the marker alone the gate reopens into that gap, VideoBinding attaches to
 * an empty element reading currentTime 0, and YouTube's own restore seek then
 * lands as an untagged `seeking` that is broadcast as if the viewer had
 * scrubbed. Echo suppression is a 500ms window, so whether the room gets
 * dragged back by the length of the video is a race. Hence `loaded`: no
 * metadata, no media, no opinion.
 *
 * The selector has to stay exactly `.ad-showing`. The player also carries
 * `ad-created` long after the ad is over, so anything looser would latch the
 * gate shut for the rest of the page's life. If YouTube renames it, the ad
 * itself stops being gated and sync goes back to fighting over breaks —
 * degraded, not broken.
 */
const PLAYER = 'ytd-watch-flexy:not([hidden]) #movie_player';
const MAIN_VIDEO = `${PLAYER} video.html5-main-video`;

const findAnchor = (root: ParentNode) => root.querySelector<HTMLVideoElement>(MAIN_VIDEO);
const adShowing = (root: ParentNode) => !!root.querySelector(`${PLAYER}.ad-showing`);
/**
 * Has media at all. `readyState === HAVE_NOTHING` means no metadata, so
 * `currentTime` is 0 because there is nothing loaded — not because the viewer
 * is at the start.
 */
const loaded = (v: HTMLVideoElement | null) => (v && v.readyState > 0 ? v : null);

/**
 * Autoplay-next: `.ytp-autonav-endscreen-countdown-overlay` is an always-present
 * child of the player, `display:none` until the video is nearly over, when it
 * counts down to the next video and takes the tab there. Its own "Cancel"
 * (`.ytp-autonav-endscreen-upnext-cancel-button`) lives inside it.
 */
export const youtubeAdapter: PlayerAdapter = {
  providerId: 'youtube',
  findVideo: (root) => (adShowing(root) ? null : loaded(findAnchor(root))),
  // Not gated on the ad: the anchor is what the sidebar lays out around, and it
  // should stay put across an ad break rather than remount on either side of it.
  findAnchor,
  upNext: {
    panel: ['.ytp-autonav-endscreen-countdown-overlay'],
    dismiss: ['.ytp-autonav-endscreen-upnext-cancel-button'],
  },
};
