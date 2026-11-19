import { describe, it, expect } from 'vitest';
import { DisneyPage } from '../lib/providers/disney-page';
import { FakePlayer, docWith, pipe } from './disney-fakes';

function setup() {
  const player = new FakePlayer();
  const ch = pipe();
  let now = 0;
  const page = new DisneyPage(docWith(player), ch.page, () => now);
  let tick = () => {};
  page.start((fn) => { tick = fn; });
  const offsets = () => ch.sentFromPage.map((m) => (m.offsetSec === null ? null : +m.offsetSec.toFixed(3)));
  return { player, ch, page, offsets, scan: () => tick(), setNow: (t: number) => { now = t; } };
}

describe('the Disney+ page half', () => {
  it('reports the offset between the two clocks once two timeupdates agree on it', () => {
    const { player, offsets } = setup();
    player.video.paused = false;
    player.advance(0.25);
    expect(offsets()).toEqual([]);
    player.advance(0.25);
    expect(offsets()).toEqual([-20]);
    // A held offset is not re-sent four times a second.
    player.advance(0.25); player.advance(0.25);
    expect(offsets()).toEqual([-20]);
  });

  it('never samples between the player\'s updates, where the playhead is stale', () => {
    const { player, offsets, scan } = setup();
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    // Playing on without a timeupdate: the playhead lags the element by up to 250ms.
    player.video.currentTime += 0.2;
    scan();
    expect(offsets()).toEqual([-20]);
  });

  it('samples a paused player on its scan, since neither clock moves', () => {
    const { player, offsets, scan } = setup();
    player.video.currentTime = 50;
    player.updatePlayhead();
    scan(); scan();
    expect(offsets()).toEqual([-20]);
  });

  it('drops the offset at a seek and sends the new one only after two samples past `seeked`', () => {
    const { player, offsets } = setup();
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    player.reloadTo(400);
    expect(offsets()).toEqual([-20, null]);
    // The first sample after the seek may still carry the old playhead; it takes two.
    player.advance(0.25);
    expect(offsets()).toEqual([-20, null]);
    player.advance(0.25);
    expect(offsets()).toEqual([-20, null, 380]);
  });

  it('carries out a seek through the player, dropping the offset before the player moves', () => {
    const { player, ch, offsets } = setup();
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    ch.facade.send({ kind: 'seek', ms: 405_000 });
    expect(player.seeks).toEqual([405_000]);
    expect(offsets()).toEqual([-20, null]);
  });

  it('gives up waiting for a `seeked` that never comes', () => {
    const { player, ch, offsets, scan, setNow } = setup();
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    ch.facade.send({ kind: 'seek', ms: 0 }); // the fake does not move: no seeking, no seeked
    player.advance(0.25); player.advance(0.25);
    expect(offsets()).toEqual([-20, null]);
    setNow(6000); scan();
    player.advance(0.25); player.advance(0.25);
    expect(offsets()).toEqual([-20, null, -20]);
  });

  it('drops the offset when new media loads in place, as at the next episode', () => {
    const { player, offsets } = setup();
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    player.video.fire('loadstart');
    expect(offsets()).toEqual([-20, null]);
  });

  it('reports the program\'s length, and none for a stream without an end', () => {
    const { player, ch } = setup();
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    expect(ch.sentFromPage.at(-1)?.durationMs).toBe(3_276_240);
    player.hasEnd = false;
    player.reloadTo(10);
    player.advance(0.25); player.advance(0.25);
    expect(ch.sentFromPage.at(-1)?.durationMs).toBeNull();
  });

  it('ignores the hidden <video>', () => {
    const { player, offsets } = setup();
    player.hidden.currentTime = 999;
    player.hidden.fire('timeupdate', 'seeking', 'timeupdate');
    expect(offsets()).toEqual([]);
  });

  it('holds back the next-episode countdown near the end, and only when asked', () => {
    const { player, ch, scan } = setup();
    player.video.currentTime = 3_276 - 120 + 20; // two minutes before the end
    player.updatePlayhead();
    scan();
    expect(player.hides).toBe(0);
    ch.facade.send({ kind: 'upNext', suppress: true });
    scan();
    expect(player.hides).toBe(2);
    player.video.currentTime = 600;
    player.updatePlayhead();
    scan();
    expect(player.hides).toBe(2); // far from the end
    ch.facade.send({ kind: 'upNext', suppress: false });
  });

  it('tells a fresh facade where things stand', () => {
    const { player, ch } = setup();
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    const before = ch.sentFromPage.length;
    ch.facade.send({ kind: 'hello' });
    expect(ch.sentFromPage.length).toBe(before + 1);
    expect(ch.sentFromPage.at(-1)?.offsetSec).toBeCloseTo(-20);
  });
});
