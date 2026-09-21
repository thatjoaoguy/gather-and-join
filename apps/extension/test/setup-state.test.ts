import { describe, it, expect } from 'vitest';
import { firstRun, nextStep, outstanding, setupComplete, setupSteps, setupSummary, type SetupInput } from '../lib/setup-state';

/** A profile that has just been installed: nothing answered, nothing saved. */
const fresh: SetupInput = { serverConfigured: false, serverState: 'unknown', mic: 'unknown', cam: 'unknown' };
const ready: SetupInput = { serverConfigured: true, serverState: 'reachable', mic: 'granted', cam: 'granted' };

describe('setupSteps', () => {
  it('asks for all three on a fresh profile, with the camera optional', () => {
    expect(setupSteps(fresh).map((s) => [s.id, s.state, s.optional])).toEqual([
      ['mic', 'todo', false],
      ['cam', 'todo', true],
      ['server', 'todo', false],
    ]);
  });

  it('is done when the devices are granted and an address answers', () => {
    const steps = setupSteps(ready);
    expect(steps.every((s) => s.state === 'done')).toBe(true);
    expect(setupComplete(steps)).toBe(true);
    expect(setupSummary(steps)).toBe('You’re all set.');
  });

  it('counts a denied microphone as in the way, a declined camera as not', () => {
    const steps = setupSteps({ ...ready, mic: 'denied', cam: 'denied' });
    expect(steps.map((s) => s.state)).toEqual(['blocked', 'blocked', 'done']);
    expect(outstanding(steps).map((s) => s.id)).toEqual(['mic']);
    expect(setupComplete(steps)).toBe(false);
  });

  it('separates an address nobody saved from one that stopped answering', () => {
    expect(setupSteps(fresh)[2]!.state).toBe('todo');
    expect(setupSteps({ ...ready, serverState: 'unreachable' })[2]!.state).toBe('blocked');
    // Mid-probe, an address that has been saved is not suddenly a step again.
    expect(setupSteps({ ...ready, serverState: 'checking' })[2]!.state).toBe('done');
  });
});

describe('setupSummary', () => {
  it('lists only what is required, and reads as a list when there are two', () => {
    expect(setupSummary(setupSteps(fresh))).toBe('Still to sort out: your microphone and the connection address.');
    expect(setupSummary(setupSteps({ ...fresh, mic: 'granted' }))).toBe('Still to sort out: the connection address.');
  });
});

describe('nextStep', () => {
  it('walks mic → camera → address, skipping what has been answered either way', () => {
    expect(nextStep(setupSteps(fresh))?.id).toBe('mic');
    expect(nextStep(setupSteps({ ...fresh, mic: 'granted' }))?.id).toBe('cam');
    expect(nextStep(setupSteps({ ...fresh, mic: 'granted', cam: 'denied' }))?.id).toBe('server');
    expect(nextStep(setupSteps(ready))).toBe(null);
  });
});

describe('firstRun', () => {
  it('holds while no address was ever saved', () => {
    expect(firstRun(fresh)).toBe(true);
    expect(firstRun({ ...fresh, serverState: 'unreachable' })).toBe(true);
  });

  it('lifts as soon as an address answers, saved or defaulted', () => {
    // Someone running the default server on their own machine can just join.
    expect(firstRun({ ...fresh, serverState: 'reachable' })).toBe(false);
    expect(firstRun({ ...fresh, serverConfigured: true })).toBe(false);
  });
});
