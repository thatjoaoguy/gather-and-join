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
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

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

  it('pauses the room where this player stopped, not at the room\'s last anchor; the stall-position sabotage reports the anchor', () => {
    vi.stubGlobal('HTMLMediaElement', { HAVE_FUTURE_DATA: 3 }); // no DOM under vitest
    for (const sabotage of [null, 'stall-position'] as const) {
      const v = fakeVideo();
      const sent: Array<{ positionMs: number; stalled?: boolean }> = [];
      const e = new SyncEngine(bindingFor(v), (o) => sent.push(o), sabotage);
      // The last frame anchored the room at 10s; 3.2s of playback later the buffer runs dry.
      e.applyRemote({ paused: false, positionMs: 10_000, updatedAt: Date.now() }, 0);
      vi.advanceTimersByTime(3200);
      v.currentTime = 13.2;
      v.readyState = 2; // HAVE_CURRENT_DATA
      e.onLocalWaiting(v as never);
      vi.advanceTimersByTime(749);
      expect(sent).toHaveLength(0); // a seek's brief `waiting` must not pause anyone
      vi.advanceTimersByTime(1);
      expect(sent).toEqual([{ paused: true, positionMs: sabotage ? 10_000 : 13_200, stalled: true }]);
    }
  });

  /** A playing engine whose player has just reported a stall at 13.2s; `sent` holds that stall. */
  function stalledEngine(sabotage: 'stall-guard' | null) {
    vi.stubGlobal('HTMLMediaElement', { HAVE_FUTURE_DATA: 3 }); // no DOM under vitest
    const v = fakeVideo();
    const sent: Array<{ paused: boolean; positionMs: number; stalled?: boolean }> = [];
    const e = new SyncEngine(bindingFor(v), (o) => sent.push(o), sabotage);
    e.applyRemote({ paused: false, positionMs: 10_000, updatedAt: Date.now() }, 0);
    vi.advanceTimersByTime(3200);
    v.currentTime = 13.2;
    v.readyState = 2;
    e.onLocalWaiting(v as never);
    vi.advanceTimersByTime(750);
    expect(sent).toEqual([{ paused: true, positionMs: 13_200, stalled: true }]);
    return { v, e, sent };
  }

  it('holds back the player\'s own play and seeking from its stall until a second after the pause comes back; the stall-guard sabotage passes them on', () => {
    for (const sabotage of [null, 'stall-guard'] as const) {
      const { v, e, sent } = stalledEngine(sabotage);
      // Data returns before the room's pause does: the player nudges itself on (GGG's case).
      v.readyState = 4;
      e.onLocalSeeking(v as never);
      expect(sent.slice(1)).toEqual(sabotage ? [{ paused: false, positionMs: 13_200 }] : []);
      sent.length = 1;

      e.applyRemote({ paused: true, positionMs: 13_200, updatedAt: Date.now() }, 0);
      expect(v.paused).toBe(true);
      // Past the echo window of that applied pause, still inside the hold: the player plays itself.
      vi.advanceTimersByTime(600);
      v.paused = false;
      e.onLocalPlay(v as never);
      if (sabotage) expect(sent.slice(1)).toEqual([{ paused: false, positionMs: 13_200 }]);
      else { expect(sent).toHaveLength(1); expect(v.paused).toBe(true); } // put back to the room's pause
      sent.length = 1;

      // A second after the pause came back, a play is somebody's again.
      vi.advanceTimersByTime(401);
      v.paused = false;
      e.onLocalPlay(v as never);
      expect(sent.slice(1)).toEqual([{ paused: false, positionMs: 13_200 }]);
    }
  });

  describe('readiness after its own stall', () => {
    /** TimeRanges from [start, end] pairs, in seconds on the element's clock. */
    const ranges = (...rs: Array<[number, number]>) => ({ length: rs.length, start: (i: number) => rs[i]![0], end: (i: number) => rs[i]![1] });
    function stalledWatching(sabotage: null = null) {
      vi.stubGlobal('HTMLMediaElement', { HAVE_FUTURE_DATA: 3 });
      const v = { ...fakeVideo(), buffered: ranges([0, 13.2]) as unknown };
      const ready: boolean[] = [];
      const e = new SyncEngine(bindingFor(v as never), () => {}, sabotage, () => {}, () => null, (r) => ready.push(r));
      e.applyRemote({ paused: false, positionMs: 10_000, updatedAt: Date.now() }, 0);
      vi.advanceTimersByTime(3200);
      v.currentTime = 13.2; v.readyState = 2;
      e.onLocalWaiting(v as never);
      vi.advanceTimersByTime(750); // the stall goes out
      e.applyRemote({ paused: true, positionMs: 13_200, updatedAt: Date.now() }, 0); // and comes back
      e.start();
      return { v, e, ready };
    }

    it('goes by what is loaded, not readyState: HBO Max\'s 4 with 1s ahead is not ready, its 2 with 12s is', () => {
      const { v, e, ready } = stalledWatching();
      v.readyState = 4; v.buffered = ranges([0, 14.2]); // measured, throttled: "enough data" with 1s loaded
      vi.advanceTimersByTime(1000);
      expect(ready).toEqual([]);
      v.readyState = 2; v.buffered = ranges([0, 25.2]); // measured, back online and paused: 12s loaded, readyState 2
      vi.advanceTimersByTime(250);
      expect(ready).toEqual([true]);
      vi.advanceTimersByTime(2000);
      expect(ready).toEqual([true]); // said once
      e.stop();
    });

    it('stops watching once the room resumes, and never reports for a player that cannot say what it has loaded', () => {
      const { v, e, ready } = stalledWatching();
      e.applyRemote({ paused: false, positionMs: 13_200, updatedAt: Date.now() }, 0);
      v.buffered = ranges([0, 60]);
      vi.advanceTimersByTime(1000);
      expect(ready).toEqual([]);
      e.stop();

      const quiet = stalledWatching();
      quiet.v.buffered = undefined; // a facade without that knowledge
      vi.advanceTimersByTime(1000);
      expect(quiet.ready).toEqual([]);
      quiet.e.stop();
    });

    it('is only about its own stall: a room paused by someone else\'s says nothing', () => {
      vi.stubGlobal('HTMLMediaElement', { HAVE_FUTURE_DATA: 3 });
      const v = { ...fakeVideo(), buffered: ranges([0, 60]) as unknown };
      const ready: boolean[] = [];
      const e = new SyncEngine(bindingFor(v as never), () => {}, null, () => {}, () => null, (r) => ready.push(r));
      e.applyRemote({ paused: true, positionMs: 13_200, updatedAt: Date.now() }, 0);
      e.start();
      vi.advanceTimersByTime(1000);
      expect(ready).toEqual([]);
      e.stop();
    });
  });

  it('ends the hold when someone else resumes the room', () => {
    const { v, e, sent } = stalledEngine(null);
    e.applyRemote({ paused: true, positionMs: 13_200, updatedAt: Date.now() }, 0);
    e.applyRemote({ paused: false, positionMs: 13_200, updatedAt: Date.now() }, 0);
    expect(v.paused).toBe(false);
    vi.advanceTimersByTime(600);
    v.currentTime = 20; // the viewer seeks, inside what would have been the hold
    e.onLocalSeeking(v as never);
    expect(sent.at(-1)).toEqual({ paused: false, positionMs: 20_000 });
  });

  it('says whether a play into a paused room came with a user gesture', () => {
    const v = fakeVideo();
    const lines: string[] = [];
    let active: boolean | null = false;
    const e = new SyncEngine(bindingFor(v), () => {}, null, (l) => lines.push(l), () => active);
    e.applyRemote({ paused: true, positionMs: 0, updatedAt: Date.now() }, 0);
    vi.advanceTimersByTime(600); // past the echo window of the applied pause
    e.onLocalPlay(v as never);
    // That play was announced and resumed the room; pause it again for the second.
    e.applyRemote({ paused: true, positionMs: 0, updatedAt: Date.now() }, 0);
    vi.advanceTimersByTime(600);
    active = true;
    e.onLocalPlay(v as never);
    expect(lines.filter((l) => l.startsWith('play while'))).toEqual([
      'play while the room is paused (user activation: no, readyState 4)',
      'play while the room is paused (user activation: yes, readyState 4)',
    ]);
  });

  it('applies a frame once when it arrives again in the snapshot after it, even to a player that pauses and plays late', () => {
    // A facade's play goes out over a message: `paused` still reads true when the copy arrives.
    const v = { ...fakeVideo(), plays: 0, play() { this.plays++; return Promise.resolve(); } };
    const lines: string[] = [];
    const e = new SyncEngine(bindingFor(v as never), () => {}, null, (l) => lines.push(l));
    const frame = { paused: false, positionMs: 10_000, updatedAt: Date.now() };
    e.applyRemote(frame, 0);
    e.applyRemote({ ...frame }, 0); // the snapshot's copy
    expect(v.plays).toBe(1);
    expect(e.counters.hardSeeks).toBe(1);
    expect(lines.filter((l) => l.startsWith('apply '))).toHaveLength(1);
    // A new anchor with the same values a moment later is a new frame: a heartbeat.
    e.applyRemote({ ...frame, updatedAt: frame.updatedAt + 5000 }, 0);
    expect(lines.filter((l) => l.startsWith('apply '))).toHaveLength(2);
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

describe('SyncEngine episode start', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
  afterEach(() => vi.useRealTimers());
  const EXTRAS_MS = 60_000;

  it('puts this copy on the room\'s timeline: skip added on the way in, taken off on the way out', () => {
    const v = fakeVideo();
    v.duration = 390;
    const sent: Array<{ positionMs: number }> = [];
    const e = new SyncEngine(bindingFor(v), (o) => sent.push(o), null);
    e.setSkip(EXTRAS_MS);
    e.applyRemote({ paused: false, positionMs: 10_000, updatedAt: Date.now() }, 0);
    expect(v.currentTime).toBe(70);
    vi.advanceTimersByTime(600); // leave the echo window
    e.onLocalPause(v as never);
    expect(sent.at(-1)?.positionMs).toBe(10_000);
  });

  it('never broadcasts a position inside the extras, and pulls this copy out of them', () => {
    const v = fakeVideo();
    v.paused = false;
    const sent: Array<{ positionMs: number }> = [];
    const e = new SyncEngine(bindingFor(v), (o) => sent.push(o), null);
    e.applyRemote({ paused: false, positionMs: 0, updatedAt: Date.now() }, 0);
    e.setSkip(EXTRAS_MS); // the start arrives while this copy plays its extras
    expect(v.currentTime).toBe(60);
    vi.advanceTimersByTime(600);
    v.currentTime = 12; // the user scrubs back into them
    e.onLocalSeeking(v as never);
    expect(sent.at(-1)?.positionMs).toBe(0);
    e.start();
    vi.advanceTimersByTime(250);
    expect(v.currentTime).toBe(60.25); // the room kept playing from the episode's first frame
    e.stop();
  });

  it('a changed skip moves the copy at once; the same skip again does nothing', () => {
    const v = fakeVideo();
    const e = new SyncEngine(bindingFor(v), () => {}, null);
    e.applyRemote({ paused: true, positionMs: 5_000, updatedAt: Date.now() }, 0);
    e.setSkip(EXTRAS_MS);
    expect(v.currentTime).toBe(65);
    const seeks = e.counters.hardSeeks;
    e.setSkip(EXTRAS_MS);
    expect(e.counters.hardSeeks).toBe(seeks);
    e.setSkip(0); // cleared
    expect(v.currentTime).toBe(5);
  });

  it('a one-second nudge while playing jumps, rather than drifting there', () => {
    const v = fakeVideo();
    v.paused = false;
    const e = new SyncEngine(bindingFor(v), () => {}, null);
    e.setSkip(EXTRAS_MS);
    e.applyRemote({ paused: false, positionMs: 5_000, updatedAt: Date.now() }, 0);
    e.setSkip(EXTRAS_MS + 1000);
    expect(v.currentTime).toBe(66);
    expect(v.playbackRate).toBe(1);
  });

  it('the episode-start sabotage ignores the skip', () => {
    const v = fakeVideo();
    const e = new SyncEngine(bindingFor(v), () => {}, 'episode-start');
    e.setSkip(EXTRAS_MS);
    e.applyRemote({ paused: true, positionMs: 5_000, updatedAt: Date.now() }, 0);
    expect(v.currentTime).toBe(5);
  });
});
