/**
 * The toolbar dot. Two halves in two contexts: the offscreen document decides what
 * the state is and reports changes, the service worker draws it onto the icon.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  applyBadge, badgeStateFrom, dotGeometry, dottedIcon, drawDot, BadgeReporter,
  type ActionApi, type BadgeState, type ConnectionFacts, type Ctx, type IconDeps,
} from '../lib/badge';

const facts = (over: Partial<ConnectionFacts> = {}): ConnectionFacts =>
  ({ room: null, socket: 'disconnected', joining: false, ...over }) as ConnectionFacts;
const inRoom = { code: 'ABC123' } as ConnectionFacts['room'];

/** Records the drawing calls in order, so the shape and the compositing are assertable. */
function fakeCtx(size: number) {
  const calls: Array<Record<string, unknown>> = [];
  const ctx = {
    fillStyle: '' as Ctx['fillStyle'],
    globalCompositeOperation: 'source-over' as Ctx['globalCompositeOperation'],
    drawImage: (image: unknown, dx: number, dy: number, dw: number, dh: number) => calls.push({ op: 'drawImage', image, dx, dy, dw, dh }),
    beginPath: () => calls.push({ op: 'beginPath' }),
    arc: (x: number, y: number, r: number, a0: number, a1: number) => calls.push({ op: 'arc', x, y, r, a0, a1, mode: ctx.globalCompositeOperation, fillStyle: ctx.fillStyle }),
    fill: () => calls.push({ op: 'fill' }),
    getImageData: () => ({ marker: `${size}px` }) as unknown as ImageData,
  };
  return { ctx: ctx as unknown as Ctx, calls, arcs: () => calls.filter((c) => c.op === 'arc') };
}

function fakeIcons(sizes: number[] = [16, 32]) {
  const surfaces = new Map<number, ReturnType<typeof fakeCtx>>();
  const icons: IconDeps = {
    sizes,
    paths: { 16: 'icon/16.png', 32: 'icon/32.png' },
    surface: (size) => {
      const s = fakeCtx(size);
      surfaces.set(size, s);
      return { getContext: () => s.ctx };
    },
    base: async (size) => `base-${size}` as unknown as CanvasImageSource,
  };
  return { icons, surfaces };
}

describe('badgeStateFrom', () => {
  it('shows nothing until there is a room', () => {
    expect(badgeStateFrom(facts())).toBe<BadgeState>('idle');
    expect(badgeStateFrom(facts({ socket: 'connected' }))).toBe<BadgeState>('idle');
  });

  it('is amber while the join is in flight, before the room exists', () => {
    expect(badgeStateFrom(facts({ joining: true, socket: 'connecting' }))).toBe<BadgeState>('joining');
  });

  it('follows the socket once in a room', () => {
    expect(badgeStateFrom(facts({ room: inRoom, socket: 'connected' }))).toBe<BadgeState>('connected');
    expect(badgeStateFrom(facts({ room: inRoom, socket: 'connecting' }))).toBe<BadgeState>('reconnecting');
    expect(badgeStateFrom(facts({ room: inRoom, socket: 'disconnected' }))).toBe<BadgeState>('reconnecting');
  });
});

describe('dotGeometry', () => {
  it('keeps the dot and its gap inside the icon, in the bottom-right corner', () => {
    for (const size of [16, 32]) {
      const { cx, cy, r, hole } = dotGeometry(size);
      expect(hole).toBeGreaterThan(r);
      expect(cx + hole).toBeLessThanOrEqual(size);
      expect(cy + hole).toBeLessThanOrEqual(size);
      // Bottom-right, not centred: past the middle on both axes.
      expect(cx).toBeGreaterThan(size / 2);
      expect(cy).toBeGreaterThan(size / 2);
    }
  });

  it('scales with the icon, so 16 and 32 are the same picture', () => {
    const small = dotGeometry(16);
    const large = dotGeometry(32);
    expect(large.r).toBeCloseTo(small.r * 2);
    expect(large.cx).toBeCloseTo(small.cx * 2);
  });
});

describe('drawDot', () => {
  it('punches a transparent gap, then fills a circle of the colour', () => {
    const { ctx, arcs } = fakeCtx(32);
    drawDot(ctx, 32, '#86d6b0');
    const [gap, dot] = arcs();
    expect(gap).toMatchObject({ mode: 'destination-out' });
    expect(dot).toMatchObject({ mode: 'source-over', fillStyle: '#86d6b0' });
    // Same centre, and the gap is the larger of the two: a ring of nothing around the dot.
    expect([dot!.x, dot!.y]).toEqual([gap!.x, gap!.y]);
    expect(dot!.r as number).toBeLessThan(gap!.r as number);
    // A full circle, not an arc.
    expect(dot!.a1).toBeCloseTo(Math.PI * 2);
  });
});

describe('dottedIcon', () => {
  it('draws the mark then the dot, once per size Chrome asks for', async () => {
    const { icons, surfaces } = fakeIcons([16, 32]);
    const out = await dottedIcon(icons, '#f2c66d');
    expect(Object.keys(out)).toEqual(['16', '32']);
    for (const size of [16, 32]) {
      const calls = surfaces.get(size)!.calls;
      expect(calls[0]).toMatchObject({ op: 'drawImage', image: `base-${size}`, dw: size, dh: size });
      expect(calls.some((c) => c.op === 'arc' && c.fillStyle === '#f2c66d')).toBe(true);
    }
  });

  it('says so rather than painting nothing when the canvas has no 2d context', async () => {
    const { icons } = fakeIcons([16]);
    await expect(dottedIcon({ ...icons, surface: () => ({ getContext: () => null }) }, '#86d6b0')).rejects.toThrow(/no 2d context/);
  });
});

describe('applyBadge', () => {
  it('sets a dotted icon and names the extension in the tooltip', async () => {
    const { icons } = fakeIcons();
    const action = { setIcon: vi.fn(), setTitle: vi.fn(), setBadgeText: vi.fn() } satisfies ActionApi;
    await applyBadge(action, 'connected', { name: 'Gather & Join', icons });
    const arg = action.setIcon.mock.calls[0]![0] as { imageData?: Record<number, unknown>; path?: unknown };
    expect(Object.keys(arg.imageData!)).toEqual(['16', '32']);
    expect(arg.path).toBeUndefined();
    expect(action.setTitle).toHaveBeenCalledWith({ title: 'Gather & Join · Connected' });
  });

  it('restores the plain mark and the default tooltip when there is no room', async () => {
    const { icons } = fakeIcons();
    const action = { setIcon: vi.fn(), setTitle: vi.fn(), setBadgeText: vi.fn() } satisfies ActionApi;
    await applyBadge(action, 'idle', { name: 'Gather & Join', icons });
    expect(action.setIcon).toHaveBeenCalledWith({ path: icons.paths });
    expect(action.setTitle).toHaveBeenCalledWith({ title: '' });
  });

  it('clears any badge an older build left behind', async () => {
    const { icons } = fakeIcons();
    const action = { setIcon: vi.fn(), setTitle: vi.fn(), setBadgeText: vi.fn() } satisfies ActionApi;
    await applyBadge(action, 'reconnecting', { name: 'Gather & Join', icons });
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '' });
  });
});

describe('BadgeReporter', () => {
  it('reports a change once, and stays quiet through the snapshots that do not change it', () => {
    const send = vi.fn();
    const reporter = new BadgeReporter(send);
    reporter.update(facts());
    reporter.update(facts());
    reporter.update(facts({ joining: true }));
    // Speaking, drift and peer media all re-emit the snapshot without touching the connection.
    reporter.update(facts({ room: inRoom, socket: 'connected' }));
    reporter.update(facts({ room: inRoom, socket: 'connected' }));
    reporter.update(facts({ room: inRoom, socket: 'disconnected' }));
    reporter.update(facts());
    expect(send.mock.calls.flat()).toEqual<BadgeState[]>(['idle', 'joining', 'connected', 'reconnecting', 'idle']);
  });
});
