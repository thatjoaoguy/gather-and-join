/**
 * Generate 16-bit PCM WAV buffers in-process. Used for (a) the fake player's
 * media source when no ffmpeg fixture exists and (b) the per-peer tone fixtures
 * in `make fixtures` fallback mode.
 */
export type WavOpts = {
  seconds: number;
  sampleRate?: number;
  /** Returns amplitude in [-1, 1] for time t (s). */
  sample: (t: number) => number;
};

export function makeWav({ seconds, sampleRate = 48_000, sample }: WavOpts): Buffer {
  const frames = Math.floor(seconds * sampleRate);
  const dataBytes = frames * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);       // PCM
  buf.writeUInt16LE(1, 22);       // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i++) {
    const v = Math.max(-1, Math.min(1, sample(i / sampleRate)));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/** A faint 1 Hz tick so the track is not literally silent (some decoders drop silence). */
export function quietTrack(seconds: number): Buffer {
  return makeWav({ seconds, sample: (t) => (t % 1 < 0.01 ? 0.01 * Math.sin(2 * Math.PI * 1000 * t) : 0) });
}

/** Ducking envelope: 3s silence, 2s tone, 3s silence, looping. */
export function duckingTone(freqHz: number, seconds: number): Buffer {
  return makeWav({
    seconds,
    sample: (t) => {
      const phase = t % 8;
      return phase >= 3 && phase < 5 ? 0.6 * Math.sin(2 * Math.PI * freqHz * t) : 0;
    },
  });
}

/** Continuous tone — for tests that must detect a drop in audio, not the envelope. */
export function continuousTone(freqHz: number, seconds: number): Buffer {
  return makeWav({ seconds, sample: (t) => 0.6 * Math.sin(2 * Math.PI * freqHz * t) });
}
