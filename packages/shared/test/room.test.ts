import { describe, it, expect } from 'vitest';
import {
  watchUrlFor, generateRoomCode, isValidRoomCode, normalizeRoomCode, expectedPositionMs, applyPlayback, applyNavigate,
  createRoomState, parseContentId, estimateOffset, decideCorrection, parseC2S,
} from '../src';

describe('room codes', () => {
  it('generates 6-char Crockford codes', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateRoomCode();
      expect(c).toHaveLength(6);
      expect(isValidRoomCode(c)).toBe(true);
      expect(c).not.toMatch(/[ILOU]/);
    }
  });
  it('normalizes ambiguous input', () => {
    expect(normalizeRoomCode(' ab1o-il ')).toBe('AB1011');
    expect(isValidRoomCode('ABCDEU')).toBe(false);
  });
});

describe('room reducer', () => {
  const s0 = createRoomState('ABC123', 'p1', 1000);
  it('advances while playing, holds while paused', () => {
    const playing = applyPlayback(s0, { paused: false, positionMs: 5000 }, 2000);
    expect(expectedPositionMs(playing, 3500)).toBe(6500);
    const paused = applyPlayback(playing, { paused: true, positionMs: 7000 }, 4000);
    expect(expectedPositionMs(paused, 9999)).toBe(7000);
  });
  it('navigate to new content resets position and pauses', () => {
    const playing = applyPlayback(s0, { paused: false, positionMs: 5000 }, 2000);
    const nav = applyNavigate(playing, 'urn:hbo:episode:G2', 'http://x/urn:hbo:episode:G2', 3000);
    expect(nav).toMatchObject({ contentId: 'urn:hbo:episode:G2', positionMs: 0, paused: true, updatedAt: 3000 });
    // Same content: no reset.
    const same = applyNavigate(nav, 'urn:hbo:episode:G2', null, 4000);
    expect(same.updatedAt).toBe(3000);
  });
});

describe('content ids', () => {
  it('parses HBO-shaped URNs from paths', () => {
    expect(parseContentId('http://localhost:4173/watch/urn:hbo:episode:GXabc123')).toBe('urn:hbo:episode:GXabc123');
    expect(parseContentId('https://play.hbomax.com/video/watch/b411d5ce-0436-44a5-856b-473fc140fe79')).toBe('hbomax:b411d5ce-0436-44a5-856b-473fc140fe79');
    expect(parseContentId('https://play.hbomax.com/home')).toBeNull();
    expect(parseContentId('https://play.hbomax.com/')).toBeNull();
    expect(parseContentId('garbage')).toBeNull();
    expect(watchUrlFor('hbomax:abc')).toBe('https://play.hbomax.com/video/watch/abc');
    expect(watchUrlFor('urn:hbo:episode:G1')).toBeNull();
  });
});

describe('clock offset', () => {
  it('keeps the lowest-RTT sample', () => {
    const est = estimateOffset([
      { clientTime: 0, serverTime: 1050, receivedAt: 100 },   // rtt 100 → offset 1000
      { clientTime: 200, serverTime: 1220, receivedAt: 240 }, // rtt 40  → offset 1000
      { clientTime: 400, serverTime: 1500, receivedAt: 600 }, // rtt 200 → offset 1000
    ]);
    expect(est).toEqual({ offsetMs: 1000, rttMs: 40 });
    expect(estimateOffset([])).toBeNull();
  });
});

describe('drift policy', () => {
  it('dead zone below 250ms', () => {
    expect(decideCorrection(0, false)).toEqual({ kind: 'none' });
    expect(decideCorrection(249, false)).toEqual({ kind: 'none' });
    expect(decideCorrection(-249, false)).toEqual({ kind: 'none' });
  });
  it('rate nudge between 250 and 1500 with hysteresis to 100', () => {
    expect(decideCorrection(800, false)).toEqual({ kind: 'rate', rate: 0.8 });
    expect(decideCorrection(-800, false)).toEqual({ kind: 'rate', rate: 1.2 });
    expect(decideCorrection(-400, false)).toEqual({ kind: 'rate', rate: 1.1 });
    expect(decideCorrection(150, true)).toEqual({ kind: 'rate', rate: 1 - 0.0375 });
    expect(decideCorrection(99, true)).toEqual({ kind: 'none' });
    expect(decideCorrection(150, false)).toEqual({ kind: 'none' });
  });
  it('hard seek only at >= 1500ms', () => {
    expect(decideCorrection(1499, false)).toEqual({ kind: 'rate', rate: 0.8 });
    expect(decideCorrection(1500, false)).toEqual({ kind: 'seek' });
    expect(decideCorrection(-4000, true)).toEqual({ kind: 'seek' });
  });
});

describe('protocol parsing', () => {
  it('accepts well-formed frames and rejects junk', () => {
    expect(parseC2S({ type: 'join', code: 'ABC123', peerId: 'p', name: 'n' })).toMatchObject({ type: 'join', create: false });
    expect(parseC2S({ type: 'playback', paused: false, positionMs: 1, clientTime: 2 })).toBeTruthy();
    expect(parseC2S({ type: 'playback', paused: 'no', positionMs: 1, clientTime: 2 })).toBeNull();
    expect(parseC2S({ type: 'explode' })).toBeNull();
    expect(parseC2S(null)).toBeNull();
    expect(parseC2S({ type: 'signal', to: 'x', payload: { sdp: 'v=0' } })).toMatchObject({ payload: { sdp: 'v=0' } });
  });
});
