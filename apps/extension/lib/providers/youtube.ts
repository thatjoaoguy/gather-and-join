import type { PlayerAdapter } from './player-adapter';

/**
 * YouTube: a real `<video>` in the top document, reached through `#movie_player`
 * inside a visible `ytd-watch-flexy`. Both halves of that scope matter — the home
 * feed's hover preview is a second `video.html5-main-video`, and routing away
 * from a watch page leaves the player in the DOM behind a `hidden`
 * ytd-watch-flexy. Attribute matching rather than `offsetParent`: this runs on
 * every DOM mutation and must not force layout.
 *
 * Ads play through that same element and it is never replaced, so nothing else
 * marks the break and the adapter reports no video for the whole of it. Two
 * conditions: `ad-showing` while the ad runs, and `loaded` for the gap after the
 * marker clears, where the element is empty and `currentTime` reads 0 until the
 * content position is restored. Reported, that 0 and the restore seek behind it
 * reach the room as a scrub. VideoBinding unwires instead, and the return is an
 * ordinary re-attach, which already resyncs to the room. The ad is untouched.
 *
 * The selector is exactly `.ad-showing`: `ad-created` stays on the player once
 * the ad is over, so anything looser latches the gate shut for good.
 */
const PLAYER = 'ytd-watch-flexy:not([hidden]) #movie_player';
const MAIN_VIDEO = `${PLAYER} video.html5-main-video`;

const findAnchor = (root: ParentNode) => root.querySelector<HTMLVideoElement>(MAIN_VIDEO);
const adShowing = (root: ParentNode) => !!root.querySelector(`${PLAYER}.ad-showing`);
/** `readyState === HAVE_NOTHING` means currentTime is 0 for want of media, not because the viewer is at the start. */
const loaded = (v: HTMLVideoElement | null) => (v && v.readyState > 0 ? v : null);

/** Autoplay-next: an always-present overlay, `display:none` until it counts down to the next video; its Cancel button is inside it. */
export const youtubeAdapter: PlayerAdapter = {
  providerId: 'youtube',
  findVideo: (root) => (adShowing(root) ? null : loaded(findAnchor(root))),
  // Ungated: the sidebar lays out around this and should sit still across a break.
  findAnchor,
  upNext: {
    panel: ['.ytp-autonav-endscreen-countdown-overlay'],
    dismiss: ['.ytp-autonav-endscreen-upnext-cancel-button'],
  },
};
