import type { PeerId } from '@gaj/shared';

/** Peers whose id starts with `obs:` are non-media observers (the test harness): never negotiated with, never shown. */
export const isObserver = (peerId: PeerId) => peerId.startsWith('obs:');
