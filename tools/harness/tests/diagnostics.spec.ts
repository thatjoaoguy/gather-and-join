import { test, expect } from '@playwright/test';
import { startParty, snapshot, state, pressPlay, waitForMesh } from '../src/party.ts';
import { waitForCondition, type Peer } from '../src/peers.ts';

/** Every realm's ring buffer, as the setup page reads them: `gajLog:<realm>` → lines. */
const logs = (p: Peer) => p.extPage.evaluate(() =>
  chrome.storage.session.get(null).then((all: Record<string, unknown>) => Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('gajLog:')))),
) as Promise<Record<string, string[]>>;

test('diagnostics: every realm reaches session storage, pages forward through the offscreen document, the setup page assembles one report', async () => {
  const party = await startParty({ n: 2, code: 'D1AG01' });
  try {
    const [a, b] = party.peers as [Peer, Peer];
    await waitForMesh(party.peers);
    await pressPlay(a);
    await waitForCondition(async () => (await state(b)).paused === false, { label: 'follower playing' });
    expect((await snapshot(a))!.room!.code).toBe('D1AG01');

    // A user seek on the follower's page is a page-realm decision; it must land in the offscreen buffer.
    await b.page.evaluate(() => { const v = document.querySelector('video')!; v.currentTime += 30; });
    await waitForCondition(async () => ((await logs(b))['gajLog:offscreen'] ?? []).some((l) => /\[sync@\w{4}\] local seek at \d+ms$/.test(l)), { label: 'page line forwarded into the offscreen buffer' });

    const [la, lb] = await Promise.all([logs(a), logs(b)]);
    const has = (buf: string[], re: RegExp) => expect(buf.some((x) => re.test(x)), `buffer has ${re}; buffer:\n${buf.join('\n')}`).toBe(true);
    const offA = la['gajLog:offscreen'] ?? [];
    has(offA, /\[room\] → join \(create\) D1AG01 as peer1$/);
    has(offA, /\[room\] ← room D1AG01 peers=1 leader=peer1 \(me\)/);
    has(offA, /\[room\] ← peerJoined peer2 peer2$/);
    has(offA, /\[rtc\] peer2 connected\/(connected|completed)\/stable$/);
    const offB = lb['gajLog:offscreen'] ?? [];
    has(offB, /\[page@\w{4}\] video attached /);
    has(offB, /\[sync@\w{4}\] apply play expected=\d+ms drift=-?\d+ms$/);
    for (const line of [...offA, ...offB]) expect(line).toMatch(/^\d\d:\d\d:\d\d\.\d{3} \[\w+(@\w{4})?\] /);
    expect((la['gajLog:background'] ?? []).some((x) => x.includes('[background] navigation ')), 'background buffer has the navigation').toBe(true);

    // The setup page assembles everything into one report. Headless Chrome has no clipboard; the preview is the same text.
    const options = await a.context.newPage();
    await options.goto(`chrome-extension://${a.extensionId}/options.html`);
    await options.click('#diag > summary'); // the block is collapsed by default
    await options.click('#diag-refresh');
    await waitForCondition(async () => ((await options.locator('#diag-preview').textContent()) ?? '').includes('--- log: offscreen'), { label: 'report assembled' });
    const report = (await options.locator('#diag-preview').textContent())!;
    expect(report).toMatch(/^Gather & Join diagnostics\ngenerated: \d{4}-/);
    expect(report).toContain('extension: Gather & Join (test build)');
    expect(report).toMatch(/socket: connected +reconnects: 0/);
    expect(report).toContain('room: D1AG01   leader: you');
    expect(report).toMatch(/peer2 +peer2 +connected\/(connected|completed)\/stable +audio=yes video=no +rx=\d+KB tx=\d+KB/);
    expect(report).toContain('--- log: background');
    expect(await options.locator('#diag-summary').textContent()).toContain('In room D1AG01 with 2 others');
    await options.close();
  } finally {
    await party.close();
    }
});
