import { queryVideo, type PlayerAdapter } from './player-adapter';

/**
 * HBO Max (inspected 2026-09-16): a single <video>, recreated on quality
 * switches, ad boundaries, fullscreen and episode transitions. Automatic bitrate
 * changes are not among those: ten minutes of them (1280 → 1024 → 416 → 1280 px)
 * played on one element (2026-11-27).
 *
 * Buffering (measured 2026-11-27, Chrome 158, throttled to 100 kbps and offline):
 * the element fires `waiting` and drops to `readyState` 2 when the buffer runs out,
 * which is what SyncEngine's stall check reads. Paused, the player keeps loading
 * (0 → 13s ahead) and never resumes by itself, not after the network comes back
 * either. `readyState` says nothing about how much is loaded: 4 with 1s ahead,
 * 2 with 12s ahead while paused. Anything asking "can this player go on?" has to
 * read `buffered`.
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
