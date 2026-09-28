/**
 * Where the test servers are. The one derivation, imported by the Playwright
 * config, the peer launcher and the sabotage matrix so they cannot disagree.
 *
 * The defaults are high ports on purpose: `ws://localhost:8080` is also the
 * extension's own `DEFAULT_SERVER_URL`, so a harness that defaulted there would
 * report its own misconfiguration in the extension's words.
 */

export const TEST_SERVER_PORT = Number(process.env.TEST_SERVER_PORT || 18080);
export const TEST_PLAYER_PORT = Number(process.env.TEST_PLAYER_PORT || 14173);

/** Set these directly only to reach servers you started yourself; see GJ_REUSE_SERVERS. */
export const SERVER_URL = process.env.SERVER_URL || `ws://localhost:${TEST_SERVER_PORT}`;
export const PLAYER_ORIGIN = process.env.PLAYER_ORIGIN || `http://localhost:${TEST_PLAYER_PORT}`;
// `||` rather than `??`: a child process clearing an inherited variable can only
// set it to '', and `Number('')` is 0.

/** A URL that ignores the port it was given is a miswired harness; under GJ_REUSE_SERVERS it is the point. */
export function assertEndpointsAgree(): void {
  const mismatches: string[] = [];
  if (process.env.TEST_SERVER_PORT && !SERVER_URL.endsWith(`:${TEST_SERVER_PORT}`))
    mismatches.push(`SERVER_URL=${SERVER_URL} does not use TEST_SERVER_PORT=${TEST_SERVER_PORT}`);
  if (process.env.TEST_PLAYER_PORT && !PLAYER_ORIGIN.endsWith(`:${TEST_PLAYER_PORT}`))
    mismatches.push(`PLAYER_ORIGIN=${PLAYER_ORIGIN} does not use TEST_PLAYER_PORT=${TEST_PLAYER_PORT}`);
  if (mismatches.length)
    throw new Error(`harness endpoints disagree with the ports they were given:\n  ${mismatches.join('\n  ')}\nUnset SERVER_URL/PLAYER_ORIGIN, or set GJ_REUSE_SERVERS=1 and drop the port overrides.`);
}
