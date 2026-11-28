import { queryVideo, type PlayerAdapter } from './player-adapter';

/**
 * HBO Max (inspected 2026-09-16): a single <video>, recreated on quality
 * switches, ad boundaries, fullscreen and episode transitions; automatic bitrate
 * changes keep the element (2026-11-27).
 *
 * Buffering (2026-11-27): `waiting` and `readyState` 2 when the buffer runs out; paused,
 * it keeps loading and never resumes by itself. `readyState` does not track what is
 * loaded (4 with 1s ahead, 2 with 12s), so readiness reads `buffered`.
 *
 * Autoplay-next: `[data-testid="up_next"]` is an always-present placeholder
 * that fills ~35s before the end with a "Cancel autoplay" button
 * (`player-ux-up-next-dismiss`) and a 15s countdown that routes to the next
 * episode ~20s *before* the current one ends. Clicking dismiss cancels that
 * early skip; the player still advances at the natural end, which is fine.
 */
export const hbomaxAdapter: PlayerAdapter = {
  providerId: 'hbomax',
  findVideo: queryVideo,
  upNext: { panel: ['[data-testid="up_next"]'], dismiss: ['[data-testid="player-ux-up-next-dismiss"]'] },
};
