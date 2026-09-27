import { describe, it, expect } from 'vitest';
import type { EpisodeStart } from '@gj/shared';
import { EpisodeStartControl, clock, clockExact, parseClock, type CopiesInput } from '../lib/sidebar/episode-start';

const SHORT = 3_360_000, LONG = 3_784_572;
const input = (over: Partial<CopiesInput> = {}): CopiesInput => ({ contentId: 'G1', durationsMs: [SHORT, LONG], start: null, ...over });

function setup() {
  const sent: Array<[string, EpisodeStart | null]> = [];
  return { sent, control: new EpisodeStartControl((cid, start) => sent.push([cid, start])) };
}

describe('EpisodeStartControl', () => {
  it('shows nothing while the copies agree', () => {
    const { control } = setup();
    expect(control.model(null)).toBeNull();
    expect(control.model(input({ durationsMs: [SHORT, SHORT + 800] }))).toBeNull();
    expect(control.model(input({ durationsMs: [LONG] }))).toBeNull();
  });

  it('proposes the length difference, takes a typed value, and aligns the longer copy to it', () => {
    const { control, sent } = setup();
    expect(control.model(input())).toEqual({ shortMs: SHORT, longMs: LONG, startMs: LONG - SHORT, set: false });
    control.enter(420_250);
    expect(control.model(input())?.startMs).toBe(420_250);
    expect(sent).toEqual([]); // editing a proposal tells nobody
    control.align();
    expect(sent).toEqual([['G1', { durationMs: LONG, startMs: 420_250 }]]);
  });

  it('once set, an edit goes to the room at once, an unchanged one does not, and clear removes it', () => {
    const { control, sent } = setup();
    const start = { durationMs: LONG, startMs: 420_000 };
    expect(control.model(input({ start }))).toEqual({ shortMs: SHORT, longMs: LONG, startMs: 420_000, set: true });
    control.enter(420_000);
    control.enter(421_040);
    control.align(); // already set: nothing
    control.clear();
    expect(sent).toEqual([['G1', { durationMs: LONG, startMs: 421_040 }], ['G1', null]]);
  });

  it('keeps the start inside the longer copy, and a new episode starts a fresh proposal', () => {
    const { control } = setup();
    control.model(input());
    control.enter(-5000);
    expect(control.model(input())?.startMs).toBe(0);
    expect(control.model(input({ contentId: 'G2', durationsMs: [SHORT, SHORT + 90_000] }))?.startMs).toBe(90_000);
  });

  it('formats clock times', () => {
    expect(clock(424_000)).toBe('7:04');
    expect(clock(3_784_572)).toBe('1:03:05');
    expect(clock(0)).toBe('0:00');
    expect(clockExact(424_250)).toBe('7:04.25');
    expect(clockExact(424_500)).toBe('7:04.5');
    expect(clockExact(424_000)).toBe('7:04');
  });

  it('reads what people type', () => {
    expect(parseClock('7:04')).toBe(424_000);
    expect(parseClock(' 7:04.25 ')).toBe(424_250);
    expect(parseClock('7:04,5')).toBe(424_500);
    expect(parseClock('1:03:05')).toBe(3_785_000);
    expect(parseClock('424.5')).toBe(424_500);
    expect(parseClock(clockExact(421_040))).toBe(421_040);
    for (const bad of ['', '7:', '7:60', '1:60:00', 'abc', '-5', '7:04.2555']) expect(parseClock(bad)).toBeNull();
  });
});
