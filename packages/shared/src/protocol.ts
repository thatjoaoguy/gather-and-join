/**
 * Wire protocol shared by the server and the extension.
 * One JSON frame per WebSocket message; `type` discriminates.
 * The server is authoritative for room state and is the clock reference.
 */

export type PeerId = string;

/** Snapshot of the authoritative room state as the server broadcasts it. */
export type RoomState = {
  code: string;
  leaderId: PeerId;
  contentId: string | null;
  /** Full URL for `contentId`, so joiners can be sent to the right page. */
  watchUrl: string | null;
  positionMs: number;
  paused: boolean;
  /** Server clock (ms) when `positionMs` was recorded. */
  updatedAt: number;
  /** Where the episode starts in the longer copies of `contentId`; null until a peer sets it, cleared by a content change. */
  episodeStart: EpisodeStart | null;
};

/**
 * Some regions are served the same episode with extras in front of it: same
 * content id, longer file. A copy that runs `durationMs` skips its first
 * `startMs`, so position 0 is the episode's first frame in every copy.
 */
export type EpisodeStart = { durationMs: number; startMs: number };

/** Self-reported device state; absent until the peer has sent a `media` frame. */
export type MediaFlags = { micOn: boolean; camOn: boolean };
/** Self-reported length of a peer's copy; absent until its player knows. Tagged with the content it measured. */
export type CopyInfo = { contentId: string; durationMs: number };
export type PeerInfo = { peerId: PeerId; name: string; media?: MediaFlags; copy?: CopyInfo };

// ---- client → server -------------------------------------------------------

export type C2S =
  | { type: 'join'; code: string; peerId: PeerId; name: string; create?: boolean }
  | { type: 'hello'; contentId: string | null; watchUrl?: string | null }
  | { type: 'playback'; paused: boolean; positionMs: number; clientTime: number; reason?: 'stall' }
  | { type: 'navigate'; contentId: string; watchUrl?: string | null }
  | { type: 'media'; micOn: boolean; camOn: boolean }
  | { type: 'duration'; contentId: string; durationMs: number }
  | { type: 'episodeStart'; contentId: string; start: EpisodeStart | null }
  | { type: 'ping'; clientTime: number }
  | { type: 'signal'; to: PeerId; payload: unknown }
  | { type: 'leave' };

// ---- server → client -------------------------------------------------------

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'NOT_IN_ROOM'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXISTS'
  | 'PEER_ID_TAKEN'
  | 'NOT_LEADER'
  | 'NO_SUCH_PEER';

export type S2C =
  | { type: 'room'; state: RoomState; peers: PeerInfo[]; yourPeerId: PeerId; isLeader: boolean }
  | { type: 'peerJoined'; peerId: PeerId; name: string }
  | { type: 'peerLeft'; peerId: PeerId; leaderId: PeerId }
  | { type: 'leader'; leaderId: PeerId }
  | { type: 'playback'; paused: boolean; positionMs: number; serverTime: number; originPeerId: PeerId; reason?: 'stall' }
  | { type: 'navigate'; contentId: string; watchUrl: string | null; originPeerId: PeerId }
  | { type: 'media'; from: PeerId; micOn: boolean; camOn: boolean }
  | { type: 'duration'; from: PeerId; contentId: string; durationMs: number }
  | { type: 'episodeStart'; start: EpisodeStart | null; originPeerId: PeerId }
  | { type: 'pong'; clientTime: number; serverTime: number }
  | { type: 'signal'; from: PeerId; payload: unknown }
  | { type: 'error'; code: ErrorCode; message: string };

export type C2SType = C2S['type'];
export type S2CType = S2C['type'];

const C2S_TYPES: ReadonlySet<string> = new Set<C2SType>([
  'join', 'hello', 'playback', 'navigate', 'media', 'duration', 'episodeStart', 'ping', 'signal', 'leave',
]);

/** Structural validation of an inbound client frame. Cheap, not exhaustive. */
export function parseC2S(raw: unknown): C2S | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.type !== 'string' || !C2S_TYPES.has(m.type)) return null;
  switch (m.type as C2SType) {
    case 'join':
      if (typeof m.code !== 'string' || typeof m.peerId !== 'string' || typeof m.name !== 'string') return null;
      return { type: 'join', code: m.code, peerId: m.peerId, name: m.name, create: m.create === true };
    case 'hello':
      if (m.contentId !== null && typeof m.contentId !== 'string') return null;
      return { type: 'hello', contentId: m.contentId as string | null, watchUrl: strOrNull(m.watchUrl) };
    case 'playback':
      if (typeof m.paused !== 'boolean' || !isFiniteNum(m.positionMs) || !isFiniteNum(m.clientTime)) return null;
      return { type: 'playback', paused: m.paused, positionMs: m.positionMs, clientTime: m.clientTime, ...(m.reason === 'stall' ? { reason: 'stall' as const } : {}) };
    case 'navigate':
      if (typeof m.contentId !== 'string') return null;
      return { type: 'navigate', contentId: m.contentId, watchUrl: strOrNull(m.watchUrl) };
    case 'media':
      if (typeof m.micOn !== 'boolean' || typeof m.camOn !== 'boolean') return null;
      return { type: 'media', micOn: m.micOn, camOn: m.camOn };
    case 'duration':
      if (typeof m.contentId !== 'string' || !isPositiveNum(m.durationMs)) return null;
      return { type: 'duration', contentId: m.contentId, durationMs: m.durationMs };
    case 'episodeStart': {
      if (typeof m.contentId !== 'string') return null;
      if (m.start === null) return { type: 'episodeStart', contentId: m.contentId, start: null };
      const st = m.start as Record<string, unknown> | undefined;
      if (typeof st !== 'object' || st === null || !isPositiveNum(st.durationMs) || !isFiniteNum(st.startMs)) return null;
      if (st.startMs < 0 || st.startMs >= st.durationMs) return null;
      return { type: 'episodeStart', contentId: m.contentId, start: { durationMs: st.durationMs, startMs: st.startMs } };
    }
    case 'ping':
      if (!isFiniteNum(m.clientTime)) return null;
      return { type: 'ping', clientTime: m.clientTime };
    case 'signal':
      if (typeof m.to !== 'string') return null;
      return { type: 'signal', to: m.to, payload: m.payload };
    case 'leave':
      return { type: 'leave' };
  }
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isPositiveNum(v: unknown): v is number {
  return isFiniteNum(v) && v > 0;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
