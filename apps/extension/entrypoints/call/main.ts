/**
 * Firefox's pinned call tab: wiring only. Capturing and sending the tracks is
 * `CallTab` (lib/call-tab.ts); the background page opens and closes this tab.
 */
import '../../lib/firefox-shim';
import { SERVICES } from '@gj/shared';
import { CallTab, type DeviceState } from '../../lib/call-tab';
import { PORT_CALL, type FromCallTab, type ToCallTab } from '../../lib/messages';
import { PerfectPeer } from '../../lib/perfect-peer';
import { ICONS } from '../../lib/ui/icons';
import { log } from '../../lib/log';

const $ = (id: string) => document.getElementById(id)!;
const port = chrome.runtime.connect({ name: PORT_CALL });

let meter: { stream: MediaStream; timer: ReturnType<typeof setInterval>; ctx: AudioContext } | null = null;
function showLevel(stream: MediaStream | null) {
  if (meter?.stream === stream) return;
  if (meter) { clearInterval(meter.timer); void meter.ctx.close(); meter = null; $('level').style.width = '0'; }
  if (!stream) return;
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  // setInterval, not requestAnimationFrame: a pinned tab is usually in the background, where frames stop.
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    $('level').style.width = `${Math.min(100, Math.round(peak * 300))}%`;
  }, 80);
  meter = { stream, timer, ctx };
}

function render(id: 'mic' | 'cam', s: DeviceState, offText: string) {
  const row = $(id);
  row.classList.toggle('on', s.state === 'on');
  row.classList.toggle('err', s.state === 'error');
  const [on, off] = id === 'mic' ? [ICONS.mic, ICONS.micOff] : [ICONS.cam, ICONS.camOff];
  $(`${id}-ic`).innerHTML = s.state === 'on' ? on : off;
  $(`${id}-text`).textContent = s.state === 'on' ? `On · ${s.label || 'default device'}`
    : s.state === 'off' ? offText
    : s.error === 'NotAllowedError' ? 'Blocked · allow it on the setup page' : `Unavailable · ${s.error}`;
}

const call = new CallTab({
  post: (m: FromCallTab) => { if (m.type === 'captured') log('call', 'captured', m.id, m.ok ? 'ok' : `${m.error}: ${m.message}`); port.postMessage(m); },
  getUserMedia: (c) => { log('call', 'getUserMedia', Object.keys(c).join(','), `visible=${document.visibilityState}`); return navigator.mediaDevices.getUserMedia(c); },
  hasFocus: () => document.hasFocus(),
  focusSelf: async () => {
    const [before] = await chrome.tabs.query({ active: true, currentWindow: true });
    const self = await chrome.tabs.getCurrent();
    if (self?.id !== undefined) await chrome.tabs.update(self.id, { active: true });
    log('call', 'to the front to capture; back to tab', before?.id ?? '-');
    return () => { if (before?.id !== undefined && before.id !== self?.id) void chrome.tabs.update(before.id, { active: true }); };
  },
  createPeer: (signal) => new PerfectPeer(false, signal, { iceServers: [] }),
  onChange: (s) => {
    render('mic', s.audio, 'Waiting for the room…');
    render('cam', s.video, 'Off until you turn it on in the room.');
    showLevel(s.audio.state === 'on' ? s.audio.stream : null);
  },
});
render('mic', call.state.audio, 'Waiting for the room…');
render('cam', call.state.video, 'Off until you turn it on in the room.');

port.onMessage.addListener((m: ToCallTab) => { void call.handle(m); });
// The background page went away (the extension reloaded): nothing here can work any more.
port.onDisconnect.addListener(() => { call.close(); window.close(); });

$('back').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: SERVICES.flatMap((p) => p.matches) });
  const latest = tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (latest?.id !== undefined) await chrome.tabs.update(latest.id, { active: true });
});
