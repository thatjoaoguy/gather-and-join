import type { PlayerAdapter } from './player-adapter';
import { embedMedia } from './yt-embed-media';

/**
 * Google Drive (inspected 2026-09-19, `/file/d/<id>/view`): there is no <video>
 * in the top document at all. Playback runs in a cross-origin iframe on
 * youtube.googleapis.com/embed/, so the media handle is the postMessage facade
 * and the layout anchor is the iframe itself.
 *
 * No autoplay-next: Drive plays one file and stops, so there is no panel to
 * suppress and nothing that can walk a follower off the room's content.
 */
const media = embedMedia((origin) => origin === 'https://youtube.googleapis.com');

export const gdriveAdapter: PlayerAdapter = {
  providerId: 'gdrive',
  findVideo: media.findVideo,
  findAnchor: media.findAnchor,
  upNext: { panel: [], dismiss: [] },
};
