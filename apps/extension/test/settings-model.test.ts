import { describe, it, expect } from 'vitest';
import type { Snapshot } from '../lib/messages';
import { settingsModel } from '../lib/sidebar/settings-model';

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  serverUrl: 'wss://party.example', socket: 'connected', joining: false, socketReconnects: 0, offsetMs: 0,
  room: { code: 'G7K2MX', leaderId: 'me', contentId: 'hbomax:x', watchUrl: null, positionMs: 0, paused: true, updatedAt: 0, episodeStart: null },
  peers: [{ peerId: 'me', name: 'Ana' }, { peerId: 'p2', name: 'Bea' }, { peerId: 'obs:1', name: 'obs' }],
  yourPeerId: 'me', isLeader: true, micOn: true, camOn: false, speaking: false,
  server: { url: 'wss://party.example', host: 'party.example', state: 'reachable', rttMs: 20, checkedAt: 1 },
  micPermission: 'granted', camPermission: 'unknown', stalledBy: null, peerMedia: {}, lastError: null,
  ...over,
});

const here = { contentId: 'hbomax:x', title: 'The Episode | HBO Max' };

describe('settingsModel', () => {
  it('is empty outside a room', () => {
    expect(settingsModel(snap({ room: null }), true, here)).toBeNull();
  });

  it('describes the room, your media and the server the way the popup does', () => {
    expect(settingsModel(snap(), true, here)).toEqual({
      code: 'G7K2MX', host: true, connection: 'Connected · 2 in the room', micOn: true, camOn: false, camProblem: null,
      server: { host: 'party.example', tone: 'ok', word: 'Reachable', hidden: false },
      episode: { service: 'HBO Max', title: 'The Episode', here: true, watchUrl: null },
    });
  });

  it('names the service, and offers only a trustworthy way to the room\'s episode from elsewhere', () => {
    const room = { ...snap().room!, contentId: 'hbomax:b411d5ce-0436-44a5-856b-473fc140fe79', watchUrl: 'javascript:alert(1)' };
    const elsewhere = { contentId: 'hbomax:other', title: 'Another show | HBO Max' };
    expect(settingsModel(snap({ room }), true, elsewhere)!.episode).toEqual({
      service: 'HBO Max', title: null, here: false, watchUrl: 'https://play.hbomax.com/video/watch/b411d5ce-0436-44a5-856b-473fc140fe79',
    });
    expect(settingsModel(snap({ room: { ...room, contentId: null } }), true, elsewhere)!.episode).toBeNull();
  });

  it('drops the service name the tab title ends with, since the panel names the service already', () => {
    const title = (t: string) => settingsModel(snap(), true, { ...here, title: t })!.episode!.title;
    expect(title('The Rains of Castamere • HBO Max')).toBe('The Rains of Castamere');
    expect(title('Watch HBO Max')).toBe('Watch HBO Max');
    expect(title('HBO Max')).toBe('HBO Max');
  });

  it('hides the address when the setup page does, and reports a camera that could not start', () => {
    const m = settingsModel(snap({ isLeader: false, socket: 'connecting', lastError: { code: 'CAMERA_NOT_ALLOWED', message: '' } }), false, here)!;
    expect(m).toMatchObject({ host: false, connection: 'Reconnecting…', camProblem: 'blocked', server: { hidden: true } });
    expect(settingsModel(snap({ lastError: { code: 'CAMERA_UNAVAILABLE', message: '' } }), true, here)!.camProblem).toBe('missing');
  });
});
