import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncEngine, DRIFT_REPORT_MS } from '../lib/sync-engine';
import type { VideoBinding } from '../lib/video-binding';

/** Minimal stand-in for HTMLVideoElement: just the fields the engine touches. */
function fakeVideo() {
  return { currentTime: 0, paused: true, playbackRate: 1, duration: 300, ended: false, readyState: 4,
    play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
}
type FV = ReturnType<typeof fakeVideo>;
const bindingFor = (v: FV | null) => ({ get: () => v as unknown as HTMLVideoElement } as unknown as VideoBinding);

describe('SyncEngine', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
  afterEach(() => vi.useRealTimers());

  it('applies a remote play with a seek only at ≥1500ms drift, and tags the echoes', () => {
    const v = fakeVideo();
    const sent: unknown[] = [];
    const e = new SyncEngine(bindingFor(v), (o) => sent.push(o), null);
    e.applyRemote({ paused: false, positionMs: 10_000, updatedAt: Date.now() }, 0);
    expect(v.paused).toBe(false);
    expect(v.currentTime).toBe(10);
    expect(e.counters.hardSeeks).toBe(1);
    // The play/seeking events this caused are swallowed; a genuine *pause* in the same window is not.
    e.onLocalPlay(v as never); e.onLocalSeeking(v as never);
    expect(sent).toHaveLength(0);
    e.onLocalPause(v as never);
    expect(sent).toEqual([{ paused: true, positionMs: 10_000 }]);
  });

  it('adopts a local seek optimistically so the drift tick does not revert it', () => {
    const v = fakeVideo();
    v.paused = false;
    const sent: unknown[] = [];
    const e = new SyncEngine(bindingFor(v), (o) => sent.push(o), null);
    e.applyRemote({ paused: false, positionMs: 0, updatedAt: Date.now() }, 0);
    v.currentTime = 60; // user seeks
    e.onLocalSeeking(v as never);
    expect(sent.at(-1)).toEqual({ paused: false, positionMs: 60_000 });
    expect(e.room).toMatchObject({ positionMs: 60_000, paused: false });
    e.start();
    vi.advanceTimersByTime(300);
    expect(e.counters.hardSeeks).toBe(0);
    expect(v.currentTime).toBe(60);
    e.stop();
  });

  it('nudges rate in the band, never seeks below 1500ms; the drift sabotage seeks everything', () => {
    for (const sabotage of [null, 'drift'] as const) {
      const v = fakeVideo();
      v.paused = false;
      const e = new SyncEngine(bindingFor(v), () => {}, sabotage);
      e.applyRemote({ paused: false, positionMs: 0, updatedAt: Date.now() }, 0);
      v.currentTime = 0.8; // 800ms ahead
      e.start();
      vi.advanceTimersByTime(250);
      if (sabotage === 'drift') { expect(e.counters.hardSeeks).toBe(1); expect(v.playbackRate).toBe(1); }
      else { expect(e.counters.hardSeeks).toBe(0); expect(v.playbackRate).toBeLessThan(1); expect(e.counters.rateAdjustments).toBe(1); }
      e.stop();
    }
  });

  it('reports decisions and a periodic drift summary through the diagnostics sink', () => {
    const v = fakeVideo();
    v.paused = false;
    const diag: string[] = [];
    const e = new SyncEngine(bindingFor(v), () => {}, null, (l) => diag.push(l));
    e.applyRemote({ paused: false, positionMs: 0, updatedAt: Date.now() }, 0);
    expect(diag).toEqual(['apply play expected=0ms drift=0ms']);
    e.start();
    v.currentTime = 60; e.onLocalSeeking(v as never);
    expect(diag.at(-1)).toBe('local seek at 60000ms');
    v.currentTime = 60.8; // 800ms ahead; the room advances 250ms before the tick, so 550ms of drift → a nudge
    vi.advanceTimersByTime(250);
    expect(diag.at(-1)).toMatch(/^nudge rate=0\.\d{3} drift=550ms$/);
    v.currentTime = 63; // and now a hard seek, which also ends the nudge
    vi.advanceTimersByTime(250);
    expect(diag.slice(-2)).toEqual([expect.stringMatching(/^hard seek to \d+ms \(drift \d+ms\)$/), 'nudge done']);
    // No summary until the report interval elapses; then one line with the counters since the last one.
    expect(diag.some((l) => l.startsWith('drift '))).toBe(false);
    vi.advanceTimersByTime(DRIFT_REPORT_MS);
    const summary = diag.find((l) => l.startsWith('drift '))!;
    expect(summary).toMatch(/^drift 30s: n=\d+ p50=\d+ms max=\d+ms seeks=[1-9]\d* nudges=[1-9]\d*$/);
    e.stop();
  });

  it('ended never pauses the room (the player owns end-of-content and auto-advance)', () => {
    const v = fakeVideo();
    v.paused = false; v.duration = 15; v.currentTime = 15; v.ended = true;
    const sent: unknown[] = [];
    const e = new SyncEngine(bindingFor(v), (o) => sent.push(o), null);
    e.applyRemote({ paused: false, positionMs: 60_000, updatedAt: Date.now() }, 0);
    sent.length = 0;
    e.onLocalPause(v as never); // media fires pause before ended
    e.onLocalEnded(v as never);
    vi.advanceTimersByTime(1500);
    expect(sent).toHaveLength(0);
  });
});
