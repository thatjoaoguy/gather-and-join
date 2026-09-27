import { describe, it, expect } from 'vitest';
import { CopyTracker } from '../lib/copy-tracker';

describe('CopyTracker', () => {
  it('reports an episode-length copy once, per content id, and holds it across a NaN element', () => {
    const reports: Array<[string, number]> = [];
    const t = new CopyTracker((cid, ms) => reports.push([cid, ms]));
    expect(t.observe('G1', NaN)).toBe(false); // metadata not loaded
    expect(t.observe('G1', 15)).toBe(false); // an ad clip
    expect(t.observe(null, 3784.572)).toBe(false);
    expect(t.observe('G1', 3784.572)).toBe(true);
    expect(t.observe('G1', NaN)).toBe(false); // the element was recreated
    expect(t.durationFor('G1')).toBe(3_784_572);
    expect(t.observe('G1', 3784.9)).toBe(true); // a reload's wobble: known length moves, the room is not told
    expect(t.observe('G2', 3360)).toBe(true); // a client-side episode change
    expect(t.durationFor('G1')).toBeNull();
    expect(reports).toEqual([['G1', 3_784_572], ['G2', 3_360_000]]);
  });
});
