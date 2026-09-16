import { describe, it, expect } from 'vitest';
import { PROVIDERS, PLAYER_HOSTS, PLAYER_MATCHES, providerForHost, providerForContentId, parseContentId, watchUrlFor, hbomax, harness } from '../src/index.ts';

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
    expect(providerForHost('example.com')).toBeNull();
    expect(providerForContentId('hbomax:abc')).toBe(hbomax);
    expect(providerForContentId('urn:hbo:episode:G1')).toBe(harness);
    expect(providerForContentId('netflix:1')).toBeNull();
  });

  it('every provider round-trips its own watch URL when it can derive one', () => {
    const id = 'hbomax:b411d5ce-0436-44a5-856b-473fc140fe79';
    const url = hbomax.watchUrl(id)!;
    expect(hbomax.parseContentId(new URL(url))).toBe(id);
    expect(harness.watchUrl('urn:hbo:episode:G1')).toBeNull(); // the server's WATCH_URL_TEMPLATE supplies it
  });

  it('a provider only parses its own page shapes on its own host', () => {
    expect(hbomax.parseContentId(new URL('https://play.hbomax.com/video/watch/b411d5ce-0436-44a5-856b-473fc140fe79'))).toBe('hbomax:b411d5ce-0436-44a5-856b-473fc140fe79');
    expect(hbomax.parseContentId(new URL('https://play.hbomax.com/home'))).toBeNull();
    expect(harness.parseContentId(new URL('http://localhost:4173/watch/urn:hbo:episode:G1'))).toBe('urn:hbo:episode:G1');
    expect(harness.parseContentId(new URL('http://localhost:4173/'))).toBeNull();
  });

  it('the facade tries every provider for an unknown host so a moved player domain still works', () => {
    expect(parseContentId('https://play.max.com/video/watch/b411d5ce-0436-44a5-856b-473fc140fe79')).toBe('hbomax:b411d5ce-0436-44a5-856b-473fc140fe79');
    expect(watchUrlFor('urn:hbo:episode:G1')).toBeNull();
  });
});
