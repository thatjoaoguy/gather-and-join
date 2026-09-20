/**
 * Ducking timings. Shared so the harness can budget against the mechanism instead of
 * copying numbers: a test that hardcodes "restores within 1.5s" silently becomes a
 * coin flip the day one of these constants moves.
 */
/** Volume multiplier while someone is talking. */
export const DUCK_LEVEL = 0.3;
/** Ramp down, and back up once the mic has been quiet for DUCK_SILENCE_MS. */
export const DUCK_DOWN_MS = 200;
export const DUCK_UP_MS = 400;
/** Mic RMS above this counts as speech. */
export const DUCK_RMS_THRESHOLD = 0.02;
/** How long the mic must stay quiet before the volume comes back. */
export const DUCK_SILENCE_MS = 1000;
/** Detector sampling period; every reaction is quantised to it. */
export const DUCK_POLL_MS = 50;

/** Remote-audio sampling period in the offscreen document; audio-gap measurements are quantised to it. */
export const REMOTE_AUDIO_SAMPLE_MS = 50;
