import { providerForHost, parseContentId, harness } from '@gj/shared';
import type { PlayerAdapter } from './player-adapter';
import { hbomaxAdapter } from './hbomax';
import { gdriveAdapter } from './gdrive';
import { youtubeAdapter } from './youtube';
import { wixvideoAdapter } from './wixvideo';
import { harnessAdapter } from './harness';

export type { PlayerAdapter } from './player-adapter';

const ADAPTERS: readonly PlayerAdapter[] = [hbomaxAdapter, gdriveAdapter, youtubeAdapter, wixvideoAdapter, harnessAdapter];

/** The adapter for the page at `hostname`, or null if no provider runs there. */
function adapterForHost(hostname: string): PlayerAdapter | null {
  const provider = providerForHost(hostname);
  if (!provider) return null;
  return ADAPTERS.find((a) => a.providerId === provider.id) ?? null;
}

/**
 * The adapter for a document at `url`, or null. The content script is injected
 * into every matching frame, because an embedded player (Wix Video) is only
 * ever a frame. A frame therefore needs both an embedded adapter and a watch
 * page of its own: a player site's other frames, and the harness's Drive-shaped
 * embed, are neither.
 */
export function adapterForDocument(url: string, isTop: boolean): PlayerAdapter | null {
  let hostname: string;
  try { hostname = new URL(url).hostname; } catch { return null; }
  const adapter = adapterForHost(hostname);
  if (!adapter || isTop) return adapter;
  return adapter.embedded && parseContentId(url) !== null ? adapter : null;
}

/**
 * Which of a tab's documents is the player, as a URL: the tab's own when it is
 * a watch page, otherwise a frame the content script would run in. A Wix
 * site's page is not a watch page; its video widget's frame is.
 */
export function playerUrlOf(tabUrl: string, frameUrls: readonly string[]): string | null {
  if (parseContentId(tabUrl)) return tabUrl;
  return frameUrls.find((u) => adapterForDocument(u, false)) ?? null;
}

/** True on the test harness's fake player, the only place the in-page test hook may attach. */
export const isHarnessHost = (hostname: string) => harness.hosts.includes(hostname);
