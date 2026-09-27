/** What the sidebar's settings panel shows, from the offscreen document's snapshot. */
import { providerForContentId, trustedWatchUrl } from '@gj/shared';
import type { Snapshot } from '../messages';
import { cameraProblem, connectionLabel, serverState, type ServerTone } from '../room-labels';

export type SettingsModel = {
  code: string;
  host: boolean;
  connection: string;
  micOn: boolean;
  camOn: boolean;
  camProblem: 'blocked' | 'missing' | null;
  /** `hidden` follows the setup page's eye, so a screen share does not show the address. */
  server: { host: string; tone: ServerTone; word: string; hidden: boolean };
  /**
   * What the room is watching. The title is this tab's own, so it is known only
   * here, on the room's episode; elsewhere there is the way there instead.
   */
  episode: { service: string | null; title: string | null; here: boolean; watchUrl: string | null } | null;
};

/** This tab: which content it is on, and what the page calls it. */
export type PageInfo = { contentId: string | null; title: string };

export function settingsModel(s: Snapshot, showServer: boolean, page: PageInfo): SettingsModel | null {
  if (!s.room) return null;
  return {
    code: s.room.code,
    host: s.isLeader,
    connection: connectionLabel(s),
    micOn: s.micOn,
    camOn: s.camOn,
    camProblem: cameraProblem(s),
    server: { host: s.server.host, ...serverState(s.server), hidden: !showServer },
    episode: episodeOf(s.room.contentId, s.room.watchUrl, page),
  };
}

function episodeOf(contentId: string | null, watchUrl: string | null, page: PageInfo): SettingsModel['episode'] {
  if (!contentId) return null;
  const here = page.contentId === contentId;
  return {
    service: providerForContentId(contentId)?.name ?? null,
    title: here ? page.title.trim() || null : null,
    here,
    watchUrl: here ? null : trustedWatchUrl(contentId, watchUrl),
  };
}
