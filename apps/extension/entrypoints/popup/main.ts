/**
 * Popup: a view over the offscreen document's snapshot. Lobby (join or create,
 * readiness) and room (code, participants, media, recovery). Screens follow
 * docs/design-system/screens/index.html.
 */
import { parseContentId, isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from '@gj/shared';
import { PORT_POPUP, type OffscreenToPopup, type PopupToOffscreen, type Snapshot } from '../../lib/messages';
import { participantsFrom, type Participant } from '../../lib/participants';
import { ReconnectingPort } from '../../lib/port';
import { ic, escapeHtml as esc } from '../../lib/ui/icons';
import { ensureQuicksand } from '../../lib/ui/fonts';

ensureQuicksand();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let snapshot: Snapshot | null = null;
let activeTabUrl: string | null = null;
let tab: 'join' | 'create' = 'join';
let showServer = true;
let probed = false;
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
/** Chrome's own permission state, so the lobby can show it before any room is joined. */
const perms: { mic: PermissionState | 'unknown'; cam: PermissionState | 'unknown' } = { mic: 'unknown', cam: 'unknown' };

const port = new ReconnectingPort<PopupToOffscreen, OffscreenToPopup>(
  PORT_POPUP,
  (m) => { if (m.type === 'snapshot') { snapshot = m.snapshot; if (!probed && !snapshot.room) { probed = true; send({ type: 'probeServer' }); } render(); } },
  () => {},
  async () => { await chrome.runtime.sendMessage({ target: 'background', type: 'ensureOffscreen' }); },
);
const send = (m: PopupToOffscreen) => port.send(m);
const toBackground = (type: string, extra: Record<string, unknown> = {}) => chrome.runtime.sendMessage({ target: 'background', type, ...extra });

// ---- lobby ----------------------------------------------------------------------------

const nameInput = $<HTMLInputElement>('name');
const codeInput = $<HTMLInputElement>('code');
const currentName = () => { const n = nameInput.value.trim() || 'Someone'; void chrome.storage.local.set({ name: n }); return n; };
const codeValid = () => isValidRoomCode(normalizeRoomCode(codeInput.value));

function setTab(t: 'join' | 'create') {
  tab = t;
  $('tab-join').setAttribute('aria-selected', String(t === 'join'));
  $('tab-create').setAttribute('aria-selected', String(t === 'create'));
  $('join-fields').hidden = t !== 'join';
  $('create-helper').hidden = t !== 'create';
  $('readiness').setAttribute('aria-label', t === 'join' ? 'Ready to join' : 'Ready to host');
  render();
}

function serverRow(s: Snapshot): string {
  const st = s.server;
  const cls = st.state === 'reachable' ? 'ok' : st.state === 'checking' ? 'busy' : st.state === 'unreachable' ? 'err' : '';
  const word = st.state === 'reachable' ? 'Reachable' : st.state === 'checking' ? 'Connecting' : st.state === 'unreachable' ? 'Can’t reach it' : 'Not checked';
  const host = showServer ? esc(st.host) : `<span class="spoiler" tabindex="0" title="Hidden · hover or press to reveal">${esc(st.host)}</span>`;
  const eye = `<button class="iconbtn" id="eye" type="button" aria-pressed="${showServer}" aria-label="${showServer ? 'Hide' : 'Show'} server address">${showServer ? ic('eye') : ic('eyeOff')}</button>`;
  return `<li class="server ${cls}">${ic('server')}<span>${host}<span class="sr"> · ${word}</span></span>${eye}<a href="#" id="change-server">Change</a></li>`;
}

function renderLobby(s: Snapshot) {
  const joining = s.joining;
  const err = s.lastError;
  const unreachable = s.server.state === 'unreachable' || err?.code === 'SERVER_UNREACHABLE';
  $('tab-join').toggleAttribute('disabled', joining);
  $('tab-create').toggleAttribute('disabled', joining);
  nameInput.disabled = joining;
  codeInput.disabled = joining;
  // Code counter and Join gating
  const n = normalizeRoomCode(codeInput.value).length;
  const count = $('count');
  count.textContent = `${Math.min(n, ROOM_CODE_LENGTH)} of ${ROOM_CODE_LENGTH}`;
  count.classList.toggle('ok', codeValid());
  const submit = $<HTMLButtonElement>('submit');
  submit.className = `${tab === 'join' ? 'primary' : 'secondary'} full`;
  const ready = tab === 'create' || codeValid();
  submit.disabled = joining || !ready || unreachable;
  submit.classList.toggle('not-ready', !joining && (!ready || unreachable));
  submit.setAttribute('aria-disabled', String(submit.disabled));
  submit.textContent = joining ? (tab === 'join' ? 'Joining…' : 'Creating…') : (tab === 'join' ? 'Join room' : 'Create a room');

  // Notice and recovery
  let notice = ''; let recovery = '';
  codeInput.removeAttribute('aria-invalid');
  if (err && !joining) {
    if (err.code === 'SERVER_UNREACHABLE') {
      const addr = showServer ? `<code>${esc(s.server.url)}</code>` : `<span class="spoiler" tabindex="0">${esc(s.server.url)}</span>`;
      notice = `<div class="notice error" role="alert"><strong>${ic('err')} Can’t reach your server</strong><p>Nothing answered at ${addr}. Check the address with the person hosting it, or make sure their machine is awake.</p></div>`;
      recovery = `<div class="media-controls"><button class="primary" id="open-setup" type="button">Open setup</button><button id="retry-probe" type="button">Try again</button></div>`;
    } else if (['ROOM_NOT_FOUND', 'ROOM_EXISTS', 'PEER_ID_TAKEN', 'BAD_CODE'].includes(err.code)) {
      const title = err.code === 'ROOM_NOT_FOUND' ? 'Room not found' : err.code === 'BAD_CODE' ? 'That code isn’t right' : 'Couldn’t join';
      const body = err.code === 'ROOM_NOT_FOUND' ? 'Check the code with your friend, and that you’re both on the same server.' : err.code === 'BAD_CODE' ? 'Room codes are 6 letters or digits.' : err.message;
      if (tab === 'join') codeInput.setAttribute('aria-invalid', 'true');
      notice = `<div class="notice error" role="alert"><strong>${ic('err')} ${title}</strong><p>${esc(body)}</p></div>`;
    } else if (err.code !== 'RECONNECTING' && !err.code.startsWith('CAMERA')) {
      notice = `<div class="notice error" role="alert"><strong>${ic('err')} Something went wrong</strong><p>${esc(err.message)}</p></div>`;
    }
  } else if (unreachable) {
    const addr = showServer ? `<code>${esc(s.server.url)}</code>` : `<span class="spoiler" tabindex="0">${esc(s.server.url)}</span>`;
    notice = `<div class="notice error" role="alert"><strong>${ic('err')} Can’t reach your server</strong><p>Nothing answered at ${addr}. Check the address with the person hosting it, or make sure their machine is awake.</p></div>`;
    recovery = `<div class="media-controls"><button class="primary" id="open-setup" type="button">Open setup</button><button id="retry-probe" type="button">Try again</button></div>`;
  }
  $('lobby-notice').innerHTML = notice;
  $('lobby-recovery').innerHTML = recovery;
  if (unreachable) submit.hidden = true; else submit.hidden = false;

  // Readiness
  const micDenied = s.micPermission === 'denied' || perms.mic === 'denied';
  const micOk = s.micPermission === 'granted' || perms.mic === 'granted';
  const camDenied = s.camPermission === 'denied' || perms.cam === 'denied';
  const camOk = s.camPermission === 'granted' || perms.cam === 'granted';
  const micRow = micDenied ? `<li class="err">${ic('micOff')}<span>Microphone blocked</span><a href="#" id="grant-mic">Allow</a></li>`
    : micOk ? `<li class="ok">${ic('mic')}<span>Microphone allowed</span></li>`
    : `<li class="warn">${ic('micOff')}<span>Microphone not set up</span><a href="#" id="grant-mic">Allow</a></li>`;
  const camRow = camDenied ? `<li class="err">${ic('camOff')}<span>Camera blocked</span><a href="#" id="grant-cam">Allow</a></li>`
    : camOk ? `<li class="ok">${ic('cam')}<span>Camera allowed · off until you turn it on</span></li>`
    : `<li class="warn">${ic('camOff')}<span>Camera not set up</span><a href="#" id="grant-cam">Allow</a></li>`;
  const srv = joining && s.server.state !== 'unreachable' ? { ...s, server: { ...s.server, state: 'checking' as const } } : s;
  $('readiness').innerHTML = micRow + camRow + serverRow(srv);
  $('lobby-foot').textContent = micDenied ? 'You can still join without a microphone; nobody will hear you until it’s allowed.' : 'Headphones on. Make yourself at home.';
}

// ---- room ------------------------------------------------------------------------------

function peerRow(p: Participant, s: Snapshot): string {
  const stateCls = p.self ? '' : p.lost ? 'failed' : p.media?.connectionState === 'connected' ? 'connected' : 'connecting';
  const reconnecting = s.socket !== 'connected';
  let stateText = '';
  if (!p.self) {
    stateText = reconnecting ? 'Reconnecting' : p.lost ? 'Connection lost' : p.media?.connectionState === 'connected' ? 'Connected' : 'Connecting…';
    if (s.stalledBy?.peerId === p.peerId) stateText += ' · buffering';
  }
  const cam = !p.self && p.media?.hasVideo ? `<span class="mini ok" title="Camera on" aria-label="Camera on">${ic('cam', 'sm')}</span>` : '';
  const muted = !p.self && p.micOn === false ? `<span class="mini warn" title="Muted" aria-label="Muted">${ic('micOff', 'sm')}</span>` : '';
  return `<div class="peer"><span class="avatar${p.leader ? ' host' : ''}${hue(p.peerId) ? ' red' : ''}" aria-hidden="true">${esc(initial(p.name))}</span>
    <div class="who"><strong>${esc(p.name)}${p.self ? ' (you)' : ''}${p.leader ? ' <span class="chip host">Host</span>' : ''}</strong>${stateText ? `<p><span class="state ${stateCls}"><i></i>${esc(stateText)}</span></p>` : ''}</div>${cam}${muted}</div>`;
}

function renderRoom(s: Snapshot) {
  const room = s.room!;
  const connected = s.socket === 'connected';
  const ps = participantsFrom(s);
  const others = ps.filter((p) => !p.self);
  $('role').textContent = s.isLeader ? 'Host' : 'Guest';
  $('role').className = `chip${s.isLeader ? ' host' : ''}`;
  $('conn').className = `conn ${connected ? 'connected' : 'connecting'}`;
  $('conn-label').textContent = connected ? (others.length ? `Connected · ${ps.length} in the room` : 'Connected · just you so far') : 'Reconnecting…';

  // Notices above the code, actions beneath them on the surface
  let notice = ''; let actions = '';
  if (!connected) notice += `<div class="notice warning" role="status"><strong>${ic('warn')} Reconnecting to your room…</strong><p>Your connection dropped. We’re trying again. Your friends stay where they are.</p></div>`;
  if (s.stalledBy) notice += `<div class="notice warning" role="status"><strong>${ic('warn')} ${esc(s.stalledBy.name === 'you' ? 'You are' : s.stalledBy.name + ' is')} buffering</strong><p>The show is paused. Press play when everyone is ready.</p></div>`;
  const here = activeTabUrl ? parseContentId(activeTabUrl) : null;
  if (room.contentId && room.watchUrl && here !== room.contentId) {
    notice += `<div class="notice info" role="status"><strong>${ic('info')} Your room is watching another episode</strong><p>Open the room’s episode to catch up with your friends.</p></div>`;
    actions += `<button class="primary full" id="goto" type="button">Go to episode</button>`;
  }
  $('room-notice').innerHTML = notice;
  $('room-actions').innerHTML = actions;

  const alone = others.length === 0;
  $('first-here').hidden = !alone;
  $('invite').textContent = alone ? 'Share the code and settle in.' : 'Invite someone with this code.';
  $('room-code').textContent = room.code;
  const copy = $<HTMLButtonElement>('copy');
  copy.className = alone ? 'primary' : '';
  copy.textContent = alone ? 'Copy code' : 'Copy';
  copy.disabled = !connected;

  $('peers').innerHTML = ps.map((p) => peerRow(p, s)).join('');

  const mic = $<HTMLButtonElement>('mic');
  mic.setAttribute('aria-pressed', String(s.micOn));
  mic.className = `toggle ${s.micOn ? 'on' : 'off'}`;
  mic.innerHTML = `${ic(s.micOn ? 'mic' : 'micOff')}${s.micOn ? 'Mic on' : 'Mic off'}`;
  const cam = $<HTMLButtonElement>('cam');
  cam.setAttribute('aria-pressed', String(s.camOn));
  cam.className = `toggle ${s.camOn ? 'on' : 'off'}`;
  cam.innerHTML = `${ic(s.camOn ? 'cam' : 'camOff')}${s.camOn ? 'Camera on' : 'Camera off'}`;

  const camErr = s.lastError && (s.lastError.code === 'CAMERA_NOT_ALLOWED' || s.lastError.code === 'CAMERA_UNAVAILABLE');
  $('cam-notice').innerHTML = camErr
    ? `<div class="notice error" role="alert"><strong>${ic('err')} ${s.lastError!.code === 'CAMERA_UNAVAILABLE' ? 'No camera found' : 'Camera access is blocked'}</strong><p>${s.lastError!.code === 'CAMERA_UNAVAILABLE' ? 'Plug one in, or check that another app isn’t using it.' : 'You can stay in the room. Allow your camera on the setup page to turn it on.'}</p></div>${s.lastError!.code === 'CAMERA_NOT_ALLOWED' ? '<button class="primary full" id="grant-cam-room" type="button" style="margin-bottom:12px">Allow camera</button>' : ''}`
    : '';
  const leader = ps.find((p) => p.leader);
  $('closing').textContent = s.isLeader ? 'Everyone can play or pause. You choose the episode.' : leader ? `Everyone can play or pause. ${leader.name} chooses the episode.` : 'Everyone can play or pause.';
}

function render() {
  const s = snapshot;
  if (!s) return;
  const inRoom = !!s.room;
  $('view-lobby').hidden = inRoom;
  $('view-room').hidden = !inRoom;
  if (inRoom) renderRoom(s); else renderLobby(s);
}

// ---- events ------------------------------------------------------------------------------

$('tab-join').onclick = () => setTab('join');
$('tab-create').onclick = () => setTab('create');
codeInput.addEventListener('input', () => {
  const normalized = normalizeRoomCode(codeInput.value);
  if (normalized !== codeInput.value) codeInput.value = normalized;
  render();
});
$('lobby-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (snapshot?.joining) return;
  if (tab === 'create') send({ type: 'createRoom', name: currentName() });
  else if (codeValid()) send({ type: 'joinRoom', code: codeInput.value, name: currentName() });
});
document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('button, a, .spoiler') as HTMLElement | null;
  if (!t) return;
  switch (t.id) {
    case 'eye': showServer = !showServer; void chrome.storage.local.set({ showServerAddress: showServer }); render(); return;
    case 'change-server': case 'open-setup': e.preventDefault(); void chrome.runtime.openOptionsPage(); return;
    case 'retry-probe': send({ type: 'probeServer' }); return;
    case 'grant-mic': e.preventDefault(); void toBackground('grantMic'); return;
    case 'grant-cam': case 'grant-cam-room': e.preventDefault(); void toBackground('grantCamera'); return;
    case 'goto': if (snapshot?.room?.watchUrl) void chrome.tabs.update({ url: snapshot.room.watchUrl }); return;
  }
  if (t.classList.contains('spoiler')) t.classList.toggle('open');
});
$('copy').onclick = async () => {
  const code = snapshot?.room?.code; if (!code) return;
  const st = $('copy-status');
  try { await navigator.clipboard.writeText(code); st.innerHTML = `<span class="mini ok">${ic('ok', 'sm')}</span> Room code copied.`; st.style.color = 'var(--success)'; }
  catch { st.textContent = 'Clipboard unavailable. Select and copy the code above.'; st.style.color = ''; }
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { st.textContent = ''; }, 2500);
};
$('mic').onclick = () => send({ type: 'setMic', on: !snapshot?.micOn });
$('cam').onclick = () => send({ type: 'setCamera', on: !snapshot?.camOn });
$('leave').onclick = () => send({ type: 'leaveRoom' });

// ---- boot --------------------------------------------------------------------------------

const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
const hue = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return (h & 1) === 1; };

void chrome.storage.local.get(['name', 'showServerAddress']).then((v) => {
  nameInput.value = (v.name as string) ?? '';
  showServer = v.showServerAddress !== false;
  render();
});
// The setup page has the same eye; keep the two in step while both are open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !('showServerAddress' in changes)) return;
  showServer = changes.showServerAddress!.newValue !== false;
  render();
});
for (const [key, name] of [['mic', 'microphone'], ['cam', 'camera']] as const) {
  navigator.permissions?.query({ name: name as PermissionName }).then((p) => { perms[key] = p.state; p.onchange = () => { perms[key] = p.state; render(); }; render(); }).catch(() => {});
}
void toBackground('getActiveTabUrl').then((u) => { activeTabUrl = u as string | null; render(); });
setTab('join');
void port.open();
