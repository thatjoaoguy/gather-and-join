import type { RoomState } from './protocol.ts';

/** Crockford base32 alphabet — no I, L, O, U, so codes survive being read aloud. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += CROCKFORD[Math.floor(random() * CROCKFORD.length)];
  }
  return out;
}

/** Normalise user input: uppercase, map the ambiguous glyphs Crockford folds. */
export function normalizeRoomCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/[^0-9A-Z]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!CROCKFORD.includes(ch)) return false;
  return true;
}

/** Room lifetime after the last participant leaves. */
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Where the room "should" be at server time `now`, given the last authoritative
 * playback update. Paused rooms do not advance.
 */
export function expectedPositionMs(state: Pick<RoomState, 'positionMs' | 'paused' | 'updatedAt'>, now: number): number {
  if (state.paused) return state.positionMs;
  return state.positionMs + Math.max(0, now - state.updatedAt);
}

export type PlaybackUpdate = { paused: boolean; positionMs: number };

/** Apply a playback command (last-write-wins by arrival order). */
export function applyPlayback(state: RoomState, update: PlaybackUpdate, now: number): RoomState {
  return { ...state, paused: update.paused, positionMs: update.positionMs, updatedAt: now };
}

/** Apply a content change. Position resets; a fresh episode starts paused at 0. */
export function applyNavigate(state: RoomState, contentId: string, watchUrl: string | null, now: number): RoomState {
  if (state.contentId === contentId) return { ...state, watchUrl: watchUrl ?? state.watchUrl };
  return { ...state, contentId, watchUrl, positionMs: 0, paused: true, updatedAt: now };
}

export function createRoomState(code: string, leaderId: string, now: number): RoomState {
  return { code, leaderId, contentId: null, watchUrl: null, positionMs: 0, paused: true, updatedAt: now };
}
