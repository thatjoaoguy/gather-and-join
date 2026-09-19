/**
 * Human-driven multi-peer run: N headed Chromes with the extension, fake media
 * and fixed peerIds, all on the fake player. Start the servers first:
 *
 *   pnpm dev:server && pnpm dev:harness      # in two terminals
 *   pnpm --filter @gj/harness launch 3      # then this
 *   REAL_MEDIA=1 pnpm --filter @gj/harness launch 2   # real mic/camera instead of fixtures
 *
 * Peer 1 creates a room (ROOM_CODE to pin one); the others join it. Ctrl-C closes everything.
 */
import { generateRoomCode } from '@gj/shared';
import { launchPeer, openPlayer, waitForCondition, closePeers, type Peer } from './peers.ts';

const n = Number(process.argv[2] ?? 2);
// Fresh code each run: rooms outlive their last peer by 6h, so a fixed code would collide with the previous run.
const code = process.env.ROOM_CODE ?? generateRoomCode();
const peers: Peer[] = [];
for (let i = 0; i < n; i++) {
  const p = await launchPeer(i, { headless: false, sabotage: (process.env.GJ_SABOTAGE as never) ?? null, realMedia: process.env.REAL_MEDIA === '1' });
  peers.push(p);
  await openPlayer(p);
  if (i === 0) await p.gj('createRoom', code, p.name);
  else await p.gj('joinRoom', code, p.name);
  await waitForCondition(async () => ((await p.gj('getSnapshot')) as any)?.room?.code === code, { timeout: 30_000, label: `${p.name} in room` });
  console.log(`${p.name} ready (extension ${p.extensionId})`);
}
console.log(`room ${code}: ${n} peers. Press play in peer1's window. Ctrl-C to exit.`);
process.on('SIGINT', async () => { await closePeers(peers); process.exit(0); });
await new Promise(() => {});
