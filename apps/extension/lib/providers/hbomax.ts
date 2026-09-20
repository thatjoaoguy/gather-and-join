import { queryVideo, type PlayerAdapter } from './player-adapter';

/**
 * HBO Max (inspected 2026-09-16): a single <video>, recreated on quality
 * switches, ad boundaries, fullscreen and episode transitions.
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
