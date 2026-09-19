/**
 * Self-identifying fake media per peer. `make fixtures` produces the full
 * versions with ffmpeg (burned-in labels); this module writes minimal
 * equivalents in-process when they are missing so the suite never depends on
 * ffmpeg being installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { duckingTone, continuousTone } from './wav.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

/** Distinct sine per peer; the receiver asserts the peak bin. */
export const PEER_TONES_HZ = [440, 554, 659, 784] as const;
/** Solid colour per peer (RGB); the receiver samples a pixel. */
export const PEER_COLORS: ReadonlyArray<[number, number, number]> = [[220, 40, 40], [40, 200, 60], [40, 80, 230], [230, 200, 30]];

export function peerFixturePaths(index: number, continuous = false) {
  return { wav: path.join(FIXTURES_DIR, `peer${index + 1}${continuous ? '-cont' : ''}.wav`), y4m: path.join(FIXTURES_DIR, `peer${index + 1}.y4m`) };
}

/** `continuous`: constant tone instead of the ducking envelope (for audio-drop assertions). */
/**
 * Write via a temp file and rename: concurrent sabotage rows generate these at the same
 * time, and an existence check alone would hand a half-written file to a Chrome that is
 * already reading it. A truncated fixture fails a tone assertion for an invisible reason.
 */
function writeIfMissing(file: string, make: () => Buffer) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, make());
  fs.renameSync(tmp, file);
}

export function ensurePeerFixtures(index: number, continuous = false) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const { wav, y4m } = peerFixturePaths(index, continuous);
  const hz = PEER_TONES_HZ[index % PEER_TONES_HZ.length]!;
  writeIfMissing(wav, () => (continuous ? continuousTone(hz, 4) : duckingTone(hz, 8)));
  writeIfMissing(y4m, () => solidY4m(PEER_COLORS[index % PEER_COLORS.length]!, 64, 48, 15, 2));
  return { wav, y4m };
}

/** Minimal Y4M: header + N identical I420 frames of one colour. */
export function solidY4m([r, g, b]: [number, number, number], w: number, h: number, fps: number, seconds: number): Buffer {
  const y = Math.round(0.257 * r + 0.504 * g + 0.098 * b + 16);
  const u = Math.round(-0.148 * r - 0.291 * g + 0.439 * b + 128);
  const v = Math.round(0.439 * r - 0.368 * g - 0.071 * b + 128);
  const header = Buffer.from(`YUV4MPEG2 W${w} H${h} F${fps}:1 Ip A1:1 C420jpeg\n`);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Buffer.alloc(w * h, y), Buffer.alloc((w * h) / 4, u), Buffer.alloc((w * h) / 4, v)]);
  const frames = fps * seconds;
  return Buffer.concat([header, ...Array.from({ length: frames }, () => frame)]);
}

/** Expected pixel after YUV round-trip is close but not exact; compare with tolerance. */
export function colorMatches(actual: [number, number, number] | null, expected: [number, number, number], tol = 60): boolean {
  if (!actual) return false;
  return Math.abs(actual[0] - expected[0]) < tol && Math.abs(actual[1] - expected[1]) < tol && Math.abs(actual[2] - expected[2]) < tol;
}
