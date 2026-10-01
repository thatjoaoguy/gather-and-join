/**
 * Every service is an optional host permission, so the player script is
 * registered at runtime for exactly the granted ones, and pages that were open
 * when a grant or a revocation happened are handled by hand.
 */
import { describe, it, expect } from 'vitest';
import { SERVICES, gdrive, hbomax, wixvideo, youtube, type ContentProvider } from '@gj/shared';
import { PLAYER_SCRIPT, PlayerAccess, matchesPattern, type AccessDeps } from '../lib/player-access';

type Registered = { id: string; matches?: string[] };

function fakeChrome(granted: ContentProvider[], tabs: Record<number, Array<{ frameId: number; url: string }>> = {}) {
  const held = new Set(granted.flatMap((p) => p.matches));
  let registered: Registered[] = [];
  const calls: string[] = [];
  const injected: Array<{ tabId: number; frameIds: number[] }> = [];
  const told: Array<{ tabId: number; frameId: number }> = [];
  const deps: AccessDeps = {
    permissions: { contains: async ({ origins }) => origins.every((o) => held.has(o)) },
    scripting: {
      getRegisteredContentScripts: async ({ ids }) => registered.filter((s) => ids.includes(s.id)),
      registerContentScripts: async (scripts) => {
        await Promise.resolve();
        for (const s of scripts) if (registered.some((r) => r.id === s.id)) throw new Error(`Duplicate script ID '${s.id}'`);
        registered.push(...scripts); calls.push('register');
      },
      updateContentScripts: async (scripts) => { registered = registered.map((r) => scripts.find((s) => s.id === r.id) ?? r); calls.push('update'); },
      unregisterContentScripts: async ({ ids }) => { registered = registered.filter((r) => !ids.includes(r.id)); calls.push('unregister'); },
      executeScript: async ({ target }) => { injected.push(target); },
    },
    tabIds: async () => Object.keys(tabs).map(Number),
    frames: async (tabId) => tabs[tabId] ?? [],
    sendToFrame: async (tabId, frameId) => { told.push({ tabId, frameId }); },
    log: () => {},
  };
  return {
    deps, calls, injected, told,
    registered: () => registered,
    grant: (p: ContentProvider) => p.matches.forEach((m) => held.add(m)),
    revoke: (p: ContentProvider) => p.matches.forEach((m) => held.delete(m)),
  };
}

const WIX_EMBED = 'https://embed.wix.com/video?instanceId=11111111-2222-4333-8444-555555555555&channelId=0123456789abcdef0123456789abcdef&videoId=fedcba9876543210fedcba9876543210';
const YOUTUBE = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const DRIVE_FILE = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view';

describe('match patterns, as Chrome reads them', () => {
  it('scopes Drive to the file viewer', () => {
    expect(matchesPattern(DRIVE_FILE, 'https://drive.google.com/file/*')).toBe(true);
    expect(matchesPattern('https://drive.google.com/drive/my-drive', 'https://drive.google.com/file/*')).toBe(false);
  });

  it('reads the query string as part of the path', () => {
    expect(matchesPattern(WIX_EMBED, 'https://embed.wix.com/video*')).toBe(true);
    expect(matchesPattern('https://embed.wix.com/other', 'https://embed.wix.com/video*')).toBe(false);
  });

  it('ignores the port and minds the scheme', () => {
    expect(matchesPattern('http://localhost:14173/watch/x', 'http://localhost/*')).toBe(true);
    expect(matchesPattern('https://localhost/watch/x', 'http://localhost/*')).toBe(false);
  });
});

describe('registering the player script', () => {
  it('registers nothing until a service is granted', async () => {
    const c = fakeChrome([]);
    await new PlayerAccess(SERVICES, c.deps).sync();
    expect(c.registered()).toEqual([]);
  });

  it('matches exactly the granted services, in every frame', async () => {
    const c = fakeChrome([gdrive, wixvideo]);
    await new PlayerAccess(SERVICES, c.deps).sync();
    expect(c.registered()).toEqual([{ id: PLAYER_SCRIPT.id, js: [PLAYER_SCRIPT.file], matches: [...gdrive.matches, ...wixvideo.matches], allFrames: true, runAt: 'document_idle' }]);
  });

  it('follows grants and revocations, and leaves a matching registration alone', async () => {
    const c = fakeChrome([hbomax]);
    const access = new PlayerAccess(SERVICES, c.deps);
    await access.sync();
    await access.sync();
    c.grant(youtube);
    await access.sync();
    expect(c.registered()[0]?.matches).toEqual([...hbomax.matches, ...youtube.matches]);
    c.revoke(hbomax); c.revoke(youtube);
    await access.sync();
    expect(c.registered()).toEqual([]);
    expect(c.calls).toEqual(['register', 'update', 'unregister']);
  });

  it('registers once when two wakes sync at the same time', async () => {
    const c = fakeChrome([hbomax]);
    const access = new PlayerAccess(SERVICES, c.deps);
    await Promise.all([access.sync(), access.sync()]);
    expect(c.calls).toEqual(['register']);
  });
});

describe('pages that were already open', () => {
  const tabs = {
    1: [{ frameId: 0, url: YOUTUBE }, { frameId: 3, url: 'https://www.youtube.com/embed/other' }],
    2: [{ frameId: 0, url: 'https://example.wixsite.com/site/videos' }, { frameId: 7, url: WIX_EMBED }],
    3: [{ frameId: 0, url: 'https://drive.google.com/drive/my-drive' }],
    4: [{ frameId: 0, url: DRIVE_FILE }],
    5: [{ frameId: 0, url: 'https://play.hbomax.com/video/watch/b411d5ce-0436-44a5-856b-473fc140fe79' }],
  };

  it('get a script in the player frame of each newly granted service, and nowhere else', async () => {
    const c = fakeChrome([youtube, wixvideo, gdrive, hbomax], tabs);
    await new PlayerAccess(SERVICES, c.deps).inject([youtube, wixvideo, gdrive]);
    // Not YouTube's own embed frame, not My Drive, and not HBO Max, which was granted before.
    expect(c.injected).toEqual([{ tabId: 1, frameIds: [0] }, { tabId: 2, frameIds: [7] }, { tabId: 4, frameIds: [0] }]);
  });

  it('stand down when their service is revoked', async () => {
    const c = fakeChrome([], tabs);
    await new PlayerAccess(SERVICES, c.deps).standDown([wixvideo]);
    expect(c.told).toEqual([{ tabId: 2, frameId: 7 }]);
  });
});

describe('what a permission event is about', () => {
  const access = new PlayerAccess(SERVICES, fakeChrome([]).deps);

  it('names services by host, whatever path Chrome reports', () => {
    expect(access.providersIn(['https://embed.wix.com/*', 'https://www.youtube.com/*'])).toEqual([youtube, wixvideo]);
    expect(access.providersIn(['https://example.com/*'])).toEqual([]);
    expect(access.providersIn(undefined)).toEqual([]);
  });

  it('ignores a navigation on a service nobody granted', async () => {
    const c = fakeChrome([youtube]);
    const a = new PlayerAccess(SERVICES, c.deps);
    expect(await a.grantedFor(YOUTUBE)).toBe(true);
    expect(await a.grantedFor(DRIVE_FILE)).toBe(false);
    // The harness is not a service a production build knows about.
    expect(await a.grantedFor('http://localhost:14173/watch/urn:hbo:episode:G0000001')).toBe(false);
  });
});
