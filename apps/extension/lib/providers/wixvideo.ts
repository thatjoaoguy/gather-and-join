import { queryVideo, type PlayerAdapter } from './player-adapter';

/**
 * Wix Video (inspected 2026-09-29, `embed.wix.com/video`): one plain <video>
 * fed by HLS over a blob URL, kept for the life of the page. It takes seeks,
 * rate changes, play and pause from script, and a play from script also clears
 * the widget's cover. The player's only move of its own is a 0 → 0.1s skip
 * when it starts at 0; a position set before starting is honored.
 *
 * `embedded`: this document is the widget's iframe inside a Wix site on any
 * domain, so the content script and the sidebar live in the frame. Opened as a
 * page, the same URL is the player full-window.
 *
 * No autoplay-next: at the end the widget returns to its cover and a
 * "Play Video" button, and stays on the same video.
 */
export const wixvideoAdapter: PlayerAdapter = {
  providerId: 'wixvideo',
  findVideo: queryVideo,
  embedded: true,
  upNext: { panel: [], dismiss: [] },
};
