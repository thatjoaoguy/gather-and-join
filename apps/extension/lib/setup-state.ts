/**
 * What a new install still owes its user: the microphone, the camera (optional)
 * and the address of the server someone in the group is hosting.
 *
 * The popup and the setup page read the same three steps, so a profile that has
 * never been through setup is told what to do rather than warned that something
 * it never chose is broken. DOM-free and Chrome-free — callers pass what they read.
 */
import type { ServerStatus } from './messages';

export type DevicePermission = 'unknown' | 'granted' | 'denied';

export type SetupInput = {
  /** An address has been saved at least once. The built-in default is nobody's choice. */
  serverConfigured: boolean;
  serverState: ServerStatus['state'];
  mic: DevicePermission;
  cam: DevicePermission;
};

export type StepId = 'mic' | 'cam' | 'server';
/** `todo`: never answered. `blocked`: answered, and the answer stands in the way. */
export type StepState = 'todo' | 'done' | 'blocked';
export type SetupStep = { id: StepId; label: string; state: StepState; optional: boolean };

export function setupSteps(input: SetupInput): SetupStep[] {
  return [
    { id: 'mic', label: 'your microphone', optional: false, state: input.mic === 'granted' ? 'done' : input.mic === 'denied' ? 'blocked' : 'todo' },
    { id: 'cam', label: 'your camera', optional: true, state: input.cam === 'granted' ? 'done' : input.cam === 'denied' ? 'blocked' : 'todo' },
    // An address that was saved and then stopped answering is the host's problem to
    // fix, not a step the user skipped — but it is still in the way of a party.
    { id: 'server', label: 'the connection address', optional: false, state: !input.serverConfigured ? 'todo' : input.serverState === 'unreachable' ? 'blocked' : 'done' },
  ];
}

/** Required steps still in the way, in the order the setup page lists them. */
export const outstanding = (steps: SetupStep[]): SetupStep[] => steps.filter((s) => !s.optional && s.state !== 'done');

export const setupComplete = (steps: SetupStep[]): boolean => outstanding(steps).length === 0;

/** Where to send someone who just finished a step: the next thing nobody has answered, camera included. */
export const nextStep = (steps: SetupStep[]): SetupStep | null => steps.find((s) => s.state === 'todo') ?? null;

/** One line for the top of the setup page. */
export function setupSummary(steps: SetupStep[]): string {
  const left = outstanding(steps);
  if (left.length === 0) return 'You’re all set.';
  const names = left.map((s) => s.label);
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Still to sort out: ${list}.`;
}

/**
 * The lobby's first-run state: nobody ever saved an address, and the built-in
 * default is not answering either. Not an error — there is nothing to fix yet.
 */
export const firstRun = (input: SetupInput): boolean => !input.serverConfigured && input.serverState !== 'reachable';
