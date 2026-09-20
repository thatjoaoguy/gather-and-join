import { providerForHost, harness } from '@gj/shared';
import type { PlayerAdapter } from './player-adapter';
import { hbomaxAdapter } from './hbomax';
import { gdriveAdapter } from './gdrive';
import { harnessAdapter } from './harness';

export type { PlayerAdapter } from './player-adapter';

const ADAPTERS: readonly PlayerAdapter[] = [hbomaxAdapter, gdriveAdapter, harnessAdapter];

/** The adapter for the page at `hostname`, or null if no provider runs there. */
export function adapterForHost(hostname: string): PlayerAdapter | null {
  const provider = providerForHost(hostname);
  if (!provider) return null;
  return ADAPTERS.find((a) => a.providerId === provider.id) ?? null;
}

/** True on the test harness's fake player, the only place the in-page test hook may attach. */
export const isHarnessHost = (hostname: string) => harness.hosts.includes(hostname);
