import { describe, it, expect } from 'vitest';
import { DisneyMedia, PAUSE_HOLD_MS, disneyMedia } from '../lib/providers/disney-media';
import { DisneyPage } from '../lib/providers/disney-page';
import { onDisneyWatchPage } from '../lib/providers/disneyplus';
import { FakePlayer, docWith, manualTimers, pipe } from './disney-fakes';

/** Both halves over the synchronous channel, as they meet across the page's two worlds. */
function setup({ bridge = true } = {}) {
  const player = new FakePlayer();
  const ch = pipe();
  const timers = manualTimers();
  let pageScan = () => {};
  const startPage = () => new DisneyPage(docWith(player), ch.page, timers.now).start((fn) => { pageScan = fn; });
  if (bridge) startPage();
  let readyCalls = 0;
  const media = new DisneyMedia(player as unknown as Element, ch.facade, () => { readyCalls++; }, timers);
  const events: string[] = [];
  for (const k of ['play', 'pause', 'seeking', 'waiting', 'playing', 'ended', 'durationchange']) media.addEventListener(k, () => events.push(k));
  /** Start playing at program time `sec` and let the page settle on the offset. */
  const playingAt = (sec: number) => {
    player.video.paused = false;
    player.video.currentTime = sec - player.offsetSec;
    player.advance(0.25); player.advance(0.25);
    events.length = 0;
  };
  return { player, ch, timers, media, events, startPage, pageScan: () => pageScan(), ready: () => readyCalls, playingAt };
}

describe('the Disney+ facade', () => {
  it('has no position until the page has one it trusts, then reads the program\'s clock', () => {
    const { player, media, ready } = setup();
    expect(media.ready).toBe(false);
    player.video.paused = false;
    player.video.currentTime = 120;
    player.advance(0.25); player.advance(0.25);
    expect(media.ready).toBe(true);
    expect(ready()).toBe(1);
    // Program position is the element's time plus the offset, at the element's own precision.
    player.video.currentTime += 0.1234;
    expect(media.currentTime).toBeCloseTo(120.5 + 0.1234 - 20, 6);
  });

  it('seeks through the player, reports the target until it lands, and lets none of the element\'s burst through', () => {
    const { player, ch, media, events, playingAt } = setup();
    playingAt(100);
    media.currentTime = 400;
    expect(ch.sentToPage).toContainEqual({ kind: 'seek', ms: 400_000 });
    expect(player.seeks).toEqual([400_000]);
    expect(events).toEqual(['seeking']); // the one SyncEngine tagged
    expect(media.currentTime).toBe(400);
    player.reloadTo(400);
    expect(media.currentTime).toBe(400);
    player.advance(0.25); player.advance(0.25);
    expect(events).toEqual(['seeking']);
    expect(media.currentTime).toBeCloseTo(400.5, 6);
  });

  it('moves a pending seek\'s position with the clock while playing, so a slow seek does not read as drift', () => {
    const { media, timers, playingAt } = setup();
    playingAt(100);
    media.currentTime = 400;
    timers.advance(1500); // the player is still loading the new position
    expect(media.currentTime).toBeCloseTo(401.5, 6);
    media.pause();
    timers.advance(1000);
    expect(media.currentTime).toBeCloseTo(401.5, 6); // paused mid-seek: holds where it had got to
  });

  it('turns a seek from the player\'s controls into one `seeking`, at the new position', () => {
    const { player, media, events, timers, playingAt } = setup();
    playingAt(100);
    const seen: number[] = [];
    media.addEventListener('seeking', () => seen.push(media.currentTime));
    player.reloadTo(700); // pause → seeking → play → seeked → playing
    // Until the page has the new offset the position holds, rather than mixing new media with the old offset.
    expect(media.currentTime).toBeCloseTo(100.5, 6);
    player.advance(0.25); player.advance(0.25);
    timers.advance(PAUSE_HOLD_MS * 2);
    expect(events).toEqual(['seeking']);
    expect(seen[0]).toBeCloseTo(700.5, 6);
  });

  it('keeps the old timeline moving while the player\'s own seek is unconfirmed, so nothing corrects it back', () => {
    const { player, media, timers, playingAt } = setup();
    playingAt(100);
    void media.currentTime; // a read stamps the last good position
    player.reloadTo(700);
    timers.advance(1200); // a slow load at the new position
    expect(media.currentTime).toBeCloseTo(101.7, 6);
  });

  it('takes the burst in Firefox\'s order too: pause, play, then seeking', () => {
    const { player, media, events, timers, playingAt } = setup();
    playingAt(100);
    const seen: number[] = [];
    media.addEventListener('seeking', () => seen.push(media.currentTime));
    player.video.paused = true; player.video.fire('pause');
    timers.advance(120);
    player.video.paused = false; player.video.fire('play', 'playing');
    timers.advance(10);
    player.video.seeking = true;
    player.video.currentTime = 20;
    player.offsetSec = 680;
    player.video.fire('seeking');
    player.video.seeking = false;
    player.video.fire('seeked', 'playing');
    timers.advance(PAUSE_HOLD_MS);
    player.advance(0.25); player.advance(0.25);
    expect(events).toEqual(['seeking']);
    expect(seen[0]).toBeCloseTo(700.5, 6);
  });

  it('passes a plain pause on, after waiting to see that no seek follows it', () => {
    const { player, events, timers, playingAt } = setup();
    playingAt(100);
    player.video.paused = true;
    player.video.fire('pause');
    expect(events).toEqual([]);
    timers.advance(PAUSE_HOLD_MS);
    expect(events).toEqual(['pause']);
  });

  it('passes the echo of its own pause on at once, inside SyncEngine\'s echo window', () => {
    const { media, events, playingAt } = setup();
    playingAt(100);
    media.pause();
    expect(events).toEqual(['pause']);
  });

  it('carries the program\'s length, never the growing end of what is loaded', () => {
    const { player, media, events } = setup();
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    expect(media.duration).toBeCloseTo(3276.24, 6);
    player.video.fire('durationchange');
    expect(events).not.toContain('durationchange');
    player.durationMs = 3_000_000;
    player.reloadTo(10);
    player.advance(0.25); player.advance(0.25);
    expect(events.filter((e) => e === 'durationchange')).toHaveLength(1);
    expect(media.duration).toBe(3000);
  });

  it('puts the player back, unannounced, if a seek leaves it playing when it was paused', () => {
    const { player, ch, media, events, playingAt } = setup();
    playingAt(100);
    media.pause();
    events.length = 0;
    media.currentTime = 300;
    // The player resumes on its own after the reload, which a paused room must not see.
    player.reloadTo(300);
    player.video.paused = false;
    player.video.fire('play', 'playing');
    player.advance(0.25); player.advance(0.25);
    expect(ch.sentToPage.at(-1)).toEqual({ kind: 'pause' });
    expect(player.video.paused).toBe(true);
    expect(events).toEqual(['seeking']);
  });

  it('reads the visible <video> and nothing from the hidden one', () => {
    const { player, media, events, playingAt } = setup();
    playingAt(100);
    player.hidden.fire('play', 'pause', 'seeking', 'ended');
    expect(events).toEqual([]);
    media.playbackRate = 1.1;
    media.volume = 0.3;
    expect(player.video.playbackRate).toBe(1.1);
    expect(player.video.volume).toBe(0.3);
    expect(player.hidden.playbackRate).toBe(1);
  });

  it('asks a page half that arrived late for the countdown hold', () => {
    const { player, ch, media, startPage } = setup({ bridge: false });
    media.suppressUpNext(true); // lost: nothing is listening yet
    startPage();
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    expect(ch.sentToPage.filter((m) => m.kind === 'upNext')).toHaveLength(2);
  });
});

describe('the Disney+ adapter', () => {
  it('reports a facade only once it is ready, the same one every time, and asks for the page half once', () => {
    const player = new FakePlayer();
    const ch = pipe();
    new DisneyPage(docWith(player), ch.page).start(() => {});
    let bridges = 0;
    let changes = 0;
    const m = disneyMedia({ channel: () => ch.facade, requestBridge: () => { bridges++; } });
    m.onChange(() => { changes++; });
    const root = docWith(player);
    expect(m.findVideo(root)).toBeNull();
    expect(m.findAnchor(root)).toBe(player);
    player.video.paused = false;
    player.advance(0.25); player.advance(0.25);
    expect(changes).toBe(1); // VideoBinding is told to look again
    const v = m.findVideo(root);
    expect(v).not.toBeNull();
    expect(m.findVideo(root)).toBe(v);
    expect(bridges).toBe(1);
    expect(m.findVideo(docWith(null))).toBeNull();
  });

  it('only runs on a watch page: the home and details pages play trailers', () => {
    expect(onDisneyWatchPage('https://www.disneyplus.com/play/0b8a4a2b-6d5b-4f35-9d8e-8f1d2b0f0c3a?contextId=abc')).toBe(true);
    expect(onDisneyWatchPage('https://www.disneyplus.com/home')).toBe(false);
    expect(onDisneyWatchPage('https://www.disneyplus.com/browse/entity-0b8a4a2b-6d5b-4f35-9d8e-8f1d2b0f0c3a')).toBe(false);
  });
});
