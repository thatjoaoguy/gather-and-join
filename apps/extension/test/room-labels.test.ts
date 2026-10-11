import { describe, it, expect } from 'vitest';
import { parseVersion, serverState, updateNeeded, updateNotice } from '../lib/room-labels';
import type { ServerStatus } from '../lib/messages';

const reachable = (version: string | null): ServerStatus => ({ url: 'wss://party.example', host: 'party.example', state: 'reachable', rttMs: 20, checkedAt: 1, version });

describe('versions', () => {
  it('parses a release and nothing else', () => {
    expect(parseVersion('0.10.0')).toEqual([0, 10, 0]);
    expect(parseVersion('dev')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });

  it('names the side that is behind, numerically rather than by string order', () => {
    expect(updateNeeded(reachable('0.9.0'), '0.10.0')).toBe('server');
    expect(updateNeeded(reachable('0.10.1'), '0.10.0')).toBe('extension');
    expect(updateNeeded(reachable('1.0.0'), '0.10.0')).toBe('extension');
    expect(updateNeeded(reachable('0.10.0'), '0.10.0')).toBeNull();
  });

  it('says nothing when either side is not a release, or the server has not been reached', () => {
    expect(updateNeeded(reachable('dev'), '0.10.0')).toBeNull();
    expect(updateNeeded(reachable(null), '0.10.0')).toBeNull();
    expect(updateNeeded({ ...reachable('0.1.0'), state: 'unreachable' }, '0.10.0')).toBeNull();
    expect(updateNeeded({ ...reachable('0.1.0'), state: 'checking' }, '0.10.0')).toBeNull();
  });

  it('turns a reachable server a release apart into a warning, and leaves a matching one green', () => {
    expect(serverState(reachable('0.10.0'), '0.10.0')).toEqual({ tone: 'ok', word: 'Reachable' });
    expect(serverState(reachable('0.9.0'), '0.10.0').tone).toBe('warn');
    expect(serverState(reachable('0.11.0'), '0.10.0').tone).toBe('warn');
    expect(serverState(reachable('0.9.0')).tone).toBe('ok'); // nothing to compare with
    expect(serverState({ ...reachable(null), state: 'waking' })).toEqual({ tone: 'busy', word: 'Waking up' });
  });

  it('words the notice for the side that has to act, with both versions in it', () => {
    const server = updateNotice(reachable('0.9.0'), '0.10.0')!;
    expect(server.side).toBe('server');
    expect(server.title).toMatch(/server/i);
    expect(server.body).toContain('0.9.0');
    expect(server.body).toContain('0.10.0');
    const extension = updateNotice(reachable('0.11.0'), '0.10.0')!;
    expect(extension.side).toBe('extension');
    expect(extension.body).toContain('chrome://extensions');
    expect(updateNotice(reachable('0.10.0'), '0.10.0')).toBeNull();
  });
});
