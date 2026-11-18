import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabCapture, type CallTabPort, type LoopbackPeer } from '../lib/tab-capture';
import { CallTab, type OfferingPeer } from '../lib/call-tab';
import type { FromCallTab, ToCallTab } from '../lib/messages';
import { FakeStream, FakeTrack, installFakeRtc } from './fakes';

class CloneableTrack extends FakeTrack {
  clones: CloneableTrack[] = [];
  clone() { const c = new CloneableTrack(this.kind); this.clones.push(c); return c; }
}

/** One end of a call-tab port, with the other end's sends recorded. */
function fakePort() {
  let onMessage: (m: FromCallTab) => void = () => {};
  let onDisconnect: () => void = () => {};
  const sent: ToCallTab[] = [];
  const port: CallTabPort & { disconnected: boolean } = {
    disconnected: false,
    post: (m) => { sent.push(m); },
    onMessage: (fn) => { onMessage = fn; },
    onDisconnect: (fn) => { onDisconnect = fn; },
    disconnect() { this.disconnected = true; },
  };
  return { port, sent, reply: (m: FromCallTab) => onMessage(m), close: () => onDisconnect() };
}

function setup(inRoom = true) {
  const peers: Array<LoopbackPeer & { pc: { ontrack: ((ev: unknown) => void) | null }; closed: boolean }> = [];
  const deps = {
    openTab: vi.fn(async () => {}),
    closeTab: vi.fn(),
    inRoom: () => inRoom,
    createPeer: vi.fn(() => {
      const p = { pc: { ontrack: null as ((ev: unknown) => void) | null }, handle: vi.fn(), close() { this.closed = true; }, closed: false };
      peers.push(p);
      return p as unknown as LoopbackPeer;
    }),
    onLost: vi.fn(),
  };
  const capture = new TabCapture(deps, { readyMs: 50, captureMs: 50 });
  return { capture, deps, peers };
}

/** The tab connects, negotiates, and its receiver tracks arrive. */
function connect(capture: TabCapture, peers: ReturnType<typeof setup>['peers']) {
  const end = fakePort();
  capture.attach(end.port);
  const audio = new CloneableTrack('audio'), video = new CloneableTrack('video');
  const peer = peers.at(-1)!;
  peer.pc.ontrack!({ track: audio });
  peer.pc.ontrack!({ track: video });
  return { ...end, audio, video, peer };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('TabCapture (Firefox: the call tab captures for the background page)', () => {
  beforeEach(() => installFakeRtc());

  it('never opens the call tab outside a room, so a grant on the setup page does not', async () => {
    const { capture, deps } = setup(false);
    await expect(capture.get('audio', {})).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(deps.openTab).not.toHaveBeenCalled();
  });

  it('opens the tab, asks it to capture, and hands back a clone of the receiver track', async () => {
    const { capture, deps, peers } = setup();
    deps.openTab.mockImplementation(async () => { queueMicrotask(() => { tab = connect(capture, peers); }); });
    let tab!: ReturnType<typeof connect>;
    const got = capture.get('audio', { echoCancellation: true });
    await flush(); await flush();
    expect(deps.openTab).toHaveBeenCalledTimes(1);
    const req = tab.sent.find((m) => m.type === 'capture')!;
    expect(req).toMatchObject({ type: 'capture', kind: 'audio', constraints: { echoCancellation: true } });
    tab.reply({ type: 'captured', id: (req as { id: number }).id, ok: true });
    const stream = await got as unknown as FakeStream;
    // A clone: LocalMedia's stop() must not end the receiver, which outlives one capture.
    expect(stream.getAudioTracks()[0]).toBe(tab.audio.clones[0]);
  });

  it('a refused capture rejects with getUserMedia\'s own error name, so permissions read the same', async () => {
    const { capture, peers } = setup();
    const tab = connect(capture, peers);
    const got = capture.get('video', {});
    await flush();
    const req = tab.sent.find((m) => m.type === 'capture') as { id: number };
    tab.reply({ type: 'captured', id: req.id, ok: false, error: 'NotAllowedError', message: 'denied' });
    await expect(got).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('closes the tab once nothing is captured, and only then', async () => {
    const { capture, deps, peers } = setup();
    const tab = connect(capture, peers);
    for (const kind of ['audio', 'video'] as const) {
      const got = capture.get(kind, {});
      await flush();
      const req = tab.sent.filter((m) => m.type === 'capture').at(-1) as { id: number };
      tab.reply({ type: 'captured', id: req.id, ok: true });
      await got;
    }
    capture.release('video');
    expect(tab.sent.at(-1)).toEqual({ type: 'release', kind: 'video' });
    expect(deps.closeTab).not.toHaveBeenCalled();
    capture.release('audio');
    expect(deps.closeTab).toHaveBeenCalledTimes(1);
    expect(tab.port.disconnected).toBe(true);
    expect(tab.peer.closed).toBe(true);
  });

  it('a tab closed by hand reports what it held, and the next capture opens a new one', async () => {
    const { capture, deps, peers } = setup();
    const tab = connect(capture, peers);
    const got = capture.get('audio', {});
    await flush();
    tab.reply({ type: 'captured', id: (tab.sent.find((m) => m.type === 'capture') as { id: number }).id, ok: true });
    await got;
    tab.close();
    expect(deps.onLost).toHaveBeenCalledWith(['audio']);
    expect(tab.peer.closed).toBe(true);
    void capture.get('audio', {}).catch(() => {});
    await flush();
    expect(deps.openTab).toHaveBeenCalledTimes(1);
  });

  it('gives up with AbortError when the tab never comes up, instead of hanging the join', async () => {
    const { capture } = setup();
    await expect(capture.get('audio', {})).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('CallTab (the page that captures)', () => {
  function tabSetup(opts: { focused?: boolean; fail?: string } = {}) {
    const senders = { audio: { replaceTrack: vi.fn(async () => {}) }, video: { replaceTrack: vi.fn(async () => {}) } };
    const transceivers: Array<{ kind: string; direction?: string }> = [];
    const peer: OfferingPeer = {
      pc: { addTransceiver: (kind, init) => { transceivers.push({ kind, direction: init.direction }); return { sender: senders[kind] }; } },
      handle: vi.fn(),
      close: vi.fn(),
    };
    const posted: FromCallTab[] = [];
    const track = new FakeTrack('audio');
    (track as unknown as { stop: () => void }).stop = vi.fn();
    const deps = {
      post: (m: FromCallTab) => { posted.push(m); },
      getUserMedia: vi.fn(async () => {
        if (opts.fail) throw new DOMException('no', opts.fail);
        return new FakeStream([track]) as unknown as MediaStream;
      }),
      hasFocus: () => opts.focused ?? true,
      goBack: vi.fn(),
      focusSelf: vi.fn(async () => deps.goBack),
      createPeer: () => peer,
      onChange: vi.fn(),
    };
    return { tab: new CallTab(deps), deps, senders, transceivers, posted, track };
  }

  it('offers both transceivers up front, so capturing never renegotiates', () => {
    const { transceivers } = tabSetup();
    expect(transceivers).toEqual([{ kind: 'audio', direction: 'sendonly' }, { kind: 'video', direction: 'sendonly' }]);
  });

  it('captures into the sender, answers, and releases with a null track', async () => {
    const { tab, senders, posted, track, deps } = tabSetup();
    await tab.handle({ type: 'capture', id: 7, kind: 'audio', constraints: {} });
    expect(senders.audio.replaceTrack).toHaveBeenCalledWith(track);
    expect(posted).toEqual([{ type: 'captured', id: 7, ok: true }]);
    expect(tab.state.audio.state).toBe('on');
    expect(deps.focusSelf).not.toHaveBeenCalled();
    await tab.handle({ type: 'release', kind: 'audio' });
    expect(senders.audio.replaceTrack).toHaveBeenLastCalledWith(null);
    expect((track as unknown as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled();
    expect(tab.state.audio.state).toBe('off');
  });

  it('comes to the front to capture (getUserMedia waits for focus), then goes back once it has started', async () => {
    const { tab, deps } = tabSetup({ focused: false });
    let backBeforeCapture = true;
    deps.getUserMedia.mockImplementationOnce(async () => { backBeforeCapture = deps.goBack.mock.calls.length > 0; return new FakeStream([new FakeTrack('audio')]) as unknown as MediaStream; });
    await tab.handle({ type: 'capture', id: 1, kind: 'audio', constraints: {} });
    expect(deps.focusSelf).toHaveBeenCalledTimes(1);
    expect(backBeforeCapture).toBe(false);
    expect(deps.goBack).toHaveBeenCalledTimes(1);
  });

  it('passes getUserMedia\'s error name back', async () => {
    const { tab, posted } = tabSetup({ fail: 'NotAllowedError' });
    await tab.handle({ type: 'capture', id: 2, kind: 'audio', constraints: {} });
    expect(posted[0]).toMatchObject({ type: 'captured', id: 2, ok: false, error: 'NotAllowedError' });
    expect(tab.state.audio).toEqual({ state: 'error', error: 'NotAllowedError' });
  });
});
