/**
 * How a room and its server are described in words. The popup and the sidebar's
 * settings panel both show them, so they say the same thing in both places.
 */
import type { ServerStatus, Snapshot } from './messages';
import { participantsFrom } from './participants';

export function connectionLabel(s: Pick<Snapshot, 'socket' | 'peers' | 'yourPeerId' | 'room' | 'peerMedia'>): string {
  if (s.socket !== 'connected') return 'Reconnecting…';
  const ps = participantsFrom(s);
  return ps.some((p) => !p.self) ? `Connected · ${ps.length} in the room` : 'Connected · just you so far';
}

export type ServerTone = 'ok' | 'busy' | 'err' | '';

export function serverState(st: ServerStatus): { tone: ServerTone; word: string } {
  switch (st.state) {
    case 'reachable': return { tone: 'ok', word: 'Reachable' };
    case 'checking': return { tone: 'busy', word: 'Connecting' };
    case 'unreachable': return { tone: 'err', word: 'Can’t reach it' };
    default: return { tone: '', word: 'Not checked' };
  }
}

/** A camera the room asked for but could not get, as the snapshot reports it. */
export function cameraProblem(s: Pick<Snapshot, 'lastError'>): 'blocked' | 'missing' | null {
  const code = s.lastError?.code;
  return code === 'CAMERA_NOT_ALLOWED' ? 'blocked' : code === 'CAMERA_UNAVAILABLE' ? 'missing' : null;
}
