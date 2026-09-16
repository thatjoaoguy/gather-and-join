import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Ducker, DUCK_LEVEL } from '../lib/ducking';

describe('Ducker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('does not ratchet the volume down across overlapping duck/restore cycles', () => {
    const v = { volume: 1 } as HTMLVideoElement;
    const d = new Ducker(() => v);
    for (let i = 0; i < 6; i++) {
      d.set(true);
      vi.advanceTimersByTime(250);
      expect(v.volume).toBeCloseTo(DUCK_LEVEL, 2);
      d.set(false);
      vi.advanceTimersByTime(150); // interrupt the restore ramp part-way, as speech resuming would
    }
    d.set(false);
    vi.advanceTimersByTime(500);
    expect(v.volume).toBeCloseTo(1, 2);
  });

  it('respects a volume the user set while not ducked', () => {
    const v = { volume: 0.5 } as HTMLVideoElement;
    const d = new Ducker(() => v);
    d.set(true); vi.advanceTimersByTime(250);
    expect(v.volume).toBeCloseTo(0.5 * DUCK_LEVEL, 2);
    d.set(false); vi.advanceTimersByTime(500);
    expect(v.volume).toBeCloseTo(0.5, 2);
  });
});
