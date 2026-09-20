import { describe, it, expect } from 'vitest';
import { PROVIDERS, PLAYER_HOSTS, PLAYER_MATCHES, providerForHost, providerForContentId, parseContentId, watchUrlFor, hbomax, gdrive, harness } from '../src/index.ts';

describe('provider registry', () => {
  it('has unique ids, hosts and match patterns', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PLAYER_HOSTS).size).toBe(PLAYER_HOSTS.length);
    expect(new Set(PLAYER_MATCHES).size).toBe(PLAYER_MATCHES.length);
    for (const p of PROVIDERS) for (const h of p.hosts) expect(p.matches.some((m) => m.includes(`://${h}/`))).toBe(true);
  });

  it('routes by host and by content id', () => {
    expect(providerForHost('play.hbomax.com')).toBe(hbomax);
    expect(providerForHost('localhost')).toBe(harness);
    expect(providerForHost('drive.google.com')).toBe(gdrive);
    expect(providerForHost('example.com')).toBeNull();
    expect(providerForContentId('hbomax:abc')).toBe(hbomax);
    expect(providerForContentId('urn:hbo:episode:G1')).toBe(harness);
    expect(providerForContentId('gdrive:1A2b3C4d5E6f7G8h')).toBe(gdrive);
    expect(providerForContentId('netflix:1')).toBeNull();
  });

  it('every provider round-trips its own watch URL when it can derive one', () => {
    const id = 'hbomax:b411d5ce-0436-44a5-856b-473fc140fe79';
    const url = hbomax.watchUrl(id)!;
    expect(hbomax.parseContentId(new URL(url))).toBe(id);
    const gid = 'gdrive:1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvWx';
    expect(gdrive.parseContentId(new URL(gdrive.watchUrl(gid)!))).toBe(gid);
    expect(harness.watchUrl('urn:hbo:episode:G1')).toBeNull(); // the server's WATCH_URL_TEMPLATE supplies it
  });

  it('a provider only parses its own page shapes on its own host', () => {
    expect(hbomax.parseContentId(new URL('https://play.hbomax.com/video/watch/b411d5ce-0436-44a5-856b-473fc140fe79'))).toBe('hbomax:b411d5ce-0436-44a5-856b-473fc140fe79');
    expect(hbomax.parseContentId(new URL('https://play.hbomax.com/home'))).toBeNull();
    expect(harness.parseContentId(new URL('http://localhost:4173/watch/urn:hbo:episode:G1'))).toBe('urn:hbo:episode:G1');
    expect(gdrive.parseContentId(new URL('https://drive.google.com/file/d/1A2b3C4d5E6f7G8h/view?usp=sharing'))).toBe('gdrive:1A2b3C4d5E6f7G8h');
    expect(gdrive.parseContentId(new URL('https://drive.google.com/file/d/1A2b3C4d5E6f7G8h/preview'))).toBe('gdrive:1A2b3C4d5E6f7G8h');
    expect(gdrive.parseContentId(new URL('https://drive.google.com/drive/u/1/file/d/1A2b3C4d5E6f7G8h/view'))).toBe('gdrive:1A2b3C4d5E6f7G8h');
    expect(gdrive.parseContentId(new URL('https://drive.google.com/drive/my-drive'))).toBeNull();
    expect(harness.parseContentId(new URL('http://localhost:4173/'))).toBeNull();
  });

  it('the facade tries every provider for an unknown host so a moved player domain still works', () => {
    expect(parseContentId('https://play.max.com/video/watch/b411d5ce-0436-44a5-856b-473fc140fe79')).toBe('hbomax:b411d5ce-0436-44a5-856b-473fc140fe79');
    expect(watchUrlFor('urn:hbo:episode:G1')).toBeNull();
  });

  it('keeps Google Drive file ids case-sensitive, unlike HBO Max uuids', () => {
    // Two Drive files can differ only in case; lowercasing would collapse them.
    expect(parseContentId('https://drive.google.com/file/d/1aB_cD-eFgHiJkLm/view')).toBe('gdrive:1aB_cD-eFgHiJkLm');
    expect(parseContentId('https://drive.google.com/file/d/1AB_CD-EFGHIJKLM/view')).toBe('gdrive:1AB_CD-EFGHIJKLM');
  });
});
