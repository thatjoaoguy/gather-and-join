/**
 * The Disney+ shape: the <video> runs on a clock of its own and every seek
 * reloads it at a new offset, so sync only holds if the extension reads and
 * seeks the program's clock on the page-world player object (see
 * apps/extension/lib/providers/disneyplus.ts for what was measured).
 *
 * Positions here come from the fake player's own program clock (`__dp.exactMs`),
 * not from the extension: a facade that is wrong the same way on every peer
 * would agree with itself perfectly.
 */
import { test, expect } from '@playwright/test';
import { startParty, percentile, pressPlay, dumpParty, state, type Party } from '../src/party.ts';
import { waitForCondition, sleepMs, EPISODE, type Peer } from '../src/peers.ts';

type Program = { ms: number; paused: boolean; at: number; path: string; marker: number };
const program = (p: Peer) => p.player().evaluate((): Program => {
  const dp = (window as any).__dp;
  const v = document.getElementById('main') as HTMLVideoElement;
  return { ms: dp.exactMs(), paused: v.paused, at: Date.now(), path: decodeURIComponent(location.pathname), marker: dp.marker };
});

/** Pairwise spread of program positions, extrapolated to one instant. */
async function programSpread(peers: Peer[]) {
  const s = await Promise.all(peers.map(program));
  const T = Math.max(...s.map((x) => x.at));
  const pos = s.map((x) => (x.paused ? x.ms : x.ms + (T - x.at)));
  return { spread: Math.max(...pos) - Math.min(...pos), pos };
}

async function playing(party: Party) {
  // The facade attaches once the page-world half has a trusted offset, a moment after the hook is up.
  await waitForCondition(async () => (await Promise.all(party.peers.map(state))).every((s) => s.positionMs !== null), { label: 'every player attached' });
  await pressPlay(party.leader);
  await waitForCondition(async () => (await Promise.all(party.peers.map(program))).every((s) => !s.paused), { label: 'everyone playing' });
  await waitForCondition(async () => (await programSpread(party.peers)).spread < 400, { timeout: 15_000, label: 'initial convergence on the program clock' });
}

test('disney-shaped sync accuracy: N=2, 40s on the program clock, p95 pairwise spread < 400ms, max < 1000ms', async () => {
  const party = await startParty({ n: 2, shape: 'disney' });
  try {
    await playing(party);
    const samples: number[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 40_000) {
      samples.push((await programSpread(party.peers)).spread);
      await sleepMs(2000);
    }
    const p95 = percentile(samples, 95);
    console.log(`disney sync accuracy: n=${samples.length} p50=${percentile(samples, 50).toFixed(0)}ms p95=${p95.toFixed(0)}ms max=${Math.max(...samples).toFixed(0)}ms`);
    expect(samples.length).toBeGreaterThanOrEqual(15);
    expect(p95).toBeLessThan(400);
    expect(Math.max(...samples)).toBeLessThan(1000);
  } catch (e) { await dumpParty(party, 'disney sync accuracy failure'); throw e; } finally { await party.close(); }
});

test('disney-shaped seek from the player\'s controls: one seek reaches the room, no pause, everyone lands on it', async () => {
  const party = await startParty({ n: 2, shape: 'disney' });
  try {
    await playing(party);
    const seeker = party.peers[1]!;
    const before = (await program(seeker)).ms;
    const target = before + 300_000; // far past anything a currentTime write could reach
    const t0 = Date.now();
    // The controls call the player object, which fires pause → seeking → play → seeked → playing.
    await seeker.player().evaluate((ms) => (document.querySelector('disney-web-player') as any).mediaPlayer.seek(ms), target);
    await waitForCondition(async () => {
      const { spread, pos } = await programSpread(party.peers);
      return spread < 500 && pos.every((p) => Math.abs(p - target) < 5000);
    }, { timeout: 10_000, label: 'everyone at the seek target on the program clock' });
    await sleepMs(1500);
    const frames = party.observer.ofType('playback').filter((f) => f.t >= t0);
    // The burst's pause and play never reach the room as such: no frame pauses it.
    expect(frames.filter((f) => f.msg.paused)).toHaveLength(0);
    expect(frames.some((f) => f.msg.originPeerId === seeker.peerId && Math.abs(f.msg.positionMs - target) < 2000)).toBe(true);
    expect((await Promise.all(party.peers.map(program))).every((s) => !s.paused)).toBe(true);
  } catch (e) { await dumpParty(party, 'disney seek failure'); throw e; } finally { await party.close(); }
});

test('disney-shaped autoplay-next: followers hold the countdown back; the leader\'s move takes everyone along', async () => {
  const party = await startParty({ n: 2, shape: 'disney' });
  try {
    await playing(party);
    const follower = party.peers[1]!;
    const followerDoc = (await program(follower)).marker;
    // Into the credits, where the player starts its 5s countdown to the next episode.
    const credits = 2_700_000 - 90_000;
    await party.leader.player().evaluate((ms) => (document.querySelector('disney-web-player') as any).mediaPlayer.seek(ms), credits);
    await waitForCondition(async () => follower.player().evaluate(() => (window as any).__dp.hides() > 0), { timeout: 5000, label: 'follower holds its countdown back' });
    // The leader's player moves on in place; the follower is taken there by the room, which loads the page anew.
    await waitForCondition(async () => (await Promise.all(party.peers.map(program))).every((s) => s.path.endsWith(EPISODE(2))), { timeout: 20_000, label: 'everyone on the next episode' });
    expect((await program(follower)).marker).not.toBe(followerDoc);
    expect(party.observer.ofType('navigate').filter((f) => f.msg.originPeerId === follower.peerId)).toHaveLength(0);
  } catch (e) { await dumpParty(party, 'disney autoplay failure'); throw e; } finally { await party.close(); }
});

test('disney-shaped layout: the controls and subtitles narrow beside the sidebar, not only the video', async () => {
  const party = await startParty({ n: 2, shape: 'disney' });
  try {
    const peer = party.peers[1]!;
    // Both layers are fixed and sized from the window, and the controls' layer is not an ancestor of the video.
    const fits = () => peer.page.evaluate(() => {
      const room = innerWidth - 240 + 1;
      const right = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().right;
      return { video: right('#main'), controls: right('disney-web-player-ui'), subtitles: right('.subtitles'), room };
    });
    await waitForCondition(async () => { const f = await fits(); return f.video <= f.room && f.controls <= f.room && f.subtitles <= f.room; }, { label: 'video, controls and subtitles beside the sidebar' });
  } catch (e) { await dumpParty(party, 'disney layout failure'); throw e; } finally { await party.close(); }
});
