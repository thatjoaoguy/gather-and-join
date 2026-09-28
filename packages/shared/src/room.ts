import type { EpisodeStart, RoomState } from './protocol.ts';

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

/**
 * Apply a content change. Position resets; a fresh episode starts paused at 0.
 * The episode start goes with it: the next episode may have no extras at all.
 */
export function applyNavigate(state: RoomState, contentId: string, watchUrl: string | null, now: number): RoomState {
  if (state.contentId === contentId) return { ...state, watchUrl: watchUrl ?? state.watchUrl };
  return { ...state, contentId, watchUrl, positionMs: 0, paused: true, updatedAt: now, episodeStart: null };
}

/** Set or clear the episode start. A frame for content the room has since left is stale and ignored. */
export function applyEpisodeStart(state: RoomState, contentId: string, start: EpisodeStart | null): RoomState {
  if (state.contentId !== contentId) return state;
  return { ...state, episodeStart: start };
}

export function createRoomState(code: string, leaderId: string, now: number): RoomState {
  return { code, leaderId, contentId: null, watchUrl: null, positionMs: 0, paused: true, updatedAt: now, episodeStart: null };
}

/**
 * Durations within this of each other are the same copy. A player's reported
 * duration wobbles by fractions of a second between loads; copies with extras
 * differ by minutes.
 */
export const COPY_TOLERANCE_MS = 5000;

export type CopyMismatch = { shortMs: number; longMs: number };

/**
 * The shortest and longest copies in the room when they differ. Only two
 * lengths are expected — one region with extras — so the gap between them is
 * the first guess at where the episode starts in the longer one.
 */
export function copyMismatch(durationsMs: readonly number[]): CopyMismatch | null {
  if (durationsMs.length < 2) return null;
  const shortMs = Math.min(...durationsMs);
  const longMs = Math.max(...durationsMs);
  return longMs - shortMs > COPY_TOLERANCE_MS ? { shortMs, longMs } : null;
}

/** How much of a copy running `durationMs` to skip: the episode start if it describes this copy, else 0. */
export function skipFor(start: EpisodeStart | null, durationMs: number | null): number {
  if (!start || durationMs === null) return 0;
  return Math.abs(durationMs - start.durationMs) <= COPY_TOLERANCE_MS ? start.startMs : 0;
}
