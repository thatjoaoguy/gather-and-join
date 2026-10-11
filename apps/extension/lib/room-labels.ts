/**
 * How a room and its server are described in words. The popup, the setup page and
 * the sidebar's settings panel all show them, so they say the same thing everywhere.
 */
import type { ServerStatus, Snapshot } from './messages';
import { participantsFrom } from './participants';

export function connectionLabel(s: Pick<Snapshot, 'socket' | 'peers' | 'yourPeerId' | 'room' | 'peerMedia'>): string {
  if (s.socket !== 'connected') return 'Reconnecting…';
  const ps = participantsFrom(s);
  return ps.some((p) => !p.self) ? `Connected · ${ps.length} in the room` : 'Connected · just you so far';
}

export type ServerTone = 'ok' | 'busy' | 'warn' | 'err' | '';

/** The server's state in a word; a reachable server a release apart from this extension is a warning, not a success. */
export function serverState(st: ServerStatus, extensionVersion?: string): { tone: ServerTone; word: string } {
  switch (st.state) {
    case 'reachable': {
      const behind = extensionVersion ? updateNeeded(st, extensionVersion) : null;
      if (behind === 'server') return { tone: 'warn', word: 'Reachable · needs an update' };
      if (behind === 'extension') return { tone: 'warn', word: 'Reachable · this extension needs an update' };
      return { tone: 'ok', word: 'Reachable' };
    }
    case 'checking': return { tone: 'busy', word: 'Connecting' };
    case 'unreachable': return { tone: 'err', word: 'Can’t reach it' };
    default: return { tone: '', word: 'Not checked' };
  }
}

// ---- versions -------------------------------------------------------------------------
// The extension and the server are released together under one version number, so the
// two sides are meant to match. There is no protocol version to be cleverer with.

/** `major.minor.patch`; null for anything else, such as the `dev` a server run from source reports. */
export function parseVersion(v: string | null | undefined): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Which side is behind the other, or null when they match or either is not a release. */
export function updateNeeded(st: Pick<ServerStatus, 'state' | 'version'>, extensionVersion: string): 'server' | 'extension' | null {
  if (st.state !== 'reachable') return null;
  const server = parseVersion(st.version);
  const extension = parseVersion(extensionVersion);
  if (!server || !extension) return null;
  for (let i = 0; i < 3; i++) {
    if (server[i]! < extension[i]!) return 'server';
    if (server[i]! > extension[i]!) return 'extension';
  }
  return null;
}

export type UpdateNotice = { side: 'server' | 'extension'; title: string; body: string };

/** The warning the popup and the setup page show when one side is behind; the page adds the way to do it. */
export function updateNotice(st: ServerStatus, extensionVersion: string): UpdateNotice | null {
  const side = updateNeeded(st, extensionVersion);
  if (!side) return null;
  const versions = `The server runs ${st.version} and this extension runs ${extensionVersion}.`;
  return side === 'server'
    ? { side, title: 'Your server needs an update', body: `${versions} Ask whoever hosts it to update it; until then the two may not get along.` }
    : { side, title: 'Gather & Join needs an update', body: `${versions} Chrome updates it on its own within a few hours. To do it now, turn on Developer mode at chrome://extensions and press Update.` };
}

/** A camera the room asked for but could not get, as the snapshot reports it. */
export function cameraProblem(s: Pick<Snapshot, 'lastError'>): 'blocked' | 'missing' | null {
  const code = s.lastError?.code;
  return code === 'CAMERA_NOT_ALLOWED' ? 'blocked' : code === 'CAMERA_UNAVAILABLE' ? 'missing' : null;
}
