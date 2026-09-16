import type { PlayerAdapter } from './player-adapter';

/** The fake player in `tools/harness/player` mirrors HBO Max's structure on purpose. */
export const harnessAdapter: PlayerAdapter = {
  providerId: 'harness',
  findVideo: (root) => root.querySelector('video'),
  upNext: { panel: ['[data-testid="up_next"]'], dismiss: ['[data-testid="player-ux-up-next-dismiss"]'] },
};
