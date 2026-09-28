/**
 * Setup page: the three things a new install owes its user — microphone, camera
 * (optional) and the connection address — plus the ducking switch and diagnostics.
 * Opened with ?grant=1 or ?grant=camera it prompts at once, then stays open on
 * whatever is still outstanding: granting one permission is not being set up.
 */
import { DEFAULT_SERVER_URL, HOST_GUIDE_URL } from '../../lib/constants';
import type { PeerStats, ServerStatus, Snapshot } from '../../lib/messages';
import { nextStep, setupComplete, setupSteps, setupSummary, type DevicePermission, type SetupStep } from '../../lib/setup-state';
import { ic } from '../../lib/ui/icons';
import { ensureQuicksand } from '../../lib/ui/fonts';

ensureQuicksand();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const wanted = new URLSearchParams(location.search).get('grant'); // "1" = mic, "camera" = camera
const urlInput = $<HTMLInputElement>('server-url');
const eye = $<HTMLButtonElement>('eye');
const serverStatus = $('server-status');
const saveStatus = $('save-status');
const saveBtn = $<HTMLButtonElement>('save');
const retryBtn = $<HTMLButtonElement>('server-retry');
let showServer = true;
let lastSaved = '';
let booted = false;
/** Everything the three steps are computed from, kept here as each source answers. */
const state = { serverConfigured: false, serverState: 'unknown' as ServerStatus['state'], mic: 'unknown' as DevicePermission, cam: 'unknown' as DevicePermission };

const toOffscreen = async <T>(msg: Record<string, unknown>): Promise<T | undefined> => {
  await chrome.runtime.sendMessage({ target: 'background', type: 'ensureOffscreen' }).catch(() => {});
  return chrome.runtime.sendMessage({ target: 'offscreen', ...msg }).catch(() => undefined);
};

// ---- what is still outstanding ----------------------------------------------------------

const steps = () => setupSteps(state);
const blockId = { mic: 'mic-block', cam: 'cam-block', server: 'server-block' } as const;
const titleId = { mic: 'mic-title', cam: 'cam-title', server: 'server-title' } as const;

/** The block under the hero: what is left to do, or that nothing is. Quiet until
 * storage has answered, so a configured profile is never told it is a fresh one. */
function showProgress() {
  if (!booted) return;
  const list = steps();
  for (const step of list) $(titleId[step.id]).classList.toggle('done', step.state === 'done');
  $('setup-state').innerHTML = setupComplete(list)
    ? `<div class="notice success"><strong>${ic('ok')} You’re all set.</strong><p>Open the Gather &amp; Join popup to create a room, or join one with a code.</p></div>`
    : `<div class="notice info"><strong>${ic('info')} ${setupSummary(list)}</strong><p>Set these up once and the extension remembers. Nothing here leaves your browser.</p></div>`;
}

/** After a grant: on to whatever nobody has answered, so one visit is enough. */
function goToNextStep() {
  const next: SetupStep | null = nextStep(steps());
  if (!next) return;
  const block = $(blockId[next.id]);
  block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  (next.id === 'server' ? urlInput : block.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
}

// ---- devices ---------------------------------------------------------------------------

type Kind = 'audio' | 'video';
const meta = { audio: { action: 'mic-action', notice: 'mic-notice', label: 'Microphone', grantId: 'grant', msg: 'micGranted', perm: 'microphone' }, video: { action: 'cam-action', notice: 'cam-notice', label: 'Camera', grantId: 'grant-cam', msg: 'cameraGranted', perm: 'camera' } } as const;

function showDevice(kind: Kind, permission: DevicePermission, errName?: string) {
  const m = meta[kind];
  const action = $(m.action);
  const notice = $(m.notice);
  state[kind === 'audio' ? 'mic' : 'cam'] = permission;
  showProgress();
  if (permission === 'granted') {
    action.innerHTML = `<span class="allowed">${ic('ok')}Allowed</span>`;
    notice.innerHTML = '';
    return;
  }
  action.innerHTML = `<button class="${kind === 'audio' ? 'primary' : ''}" id="${m.grantId}" type="button">${permission === 'denied' ? 'Try again' : `Allow ${m.label.toLowerCase()}`}</button>`;
  $(m.grantId).onclick = () => grant(kind);
  notice.innerHTML = permission === 'denied'
    ? `<div class="notice error" role="alert"><strong>${ic('err')} ${m.label} not allowed</strong><p>Chrome or your system blocked it${errName ? ` (<code>${errName}</code>)` : ''}. Check Chrome’s site settings for this extension and your system’s privacy settings for the ${m.label.toLowerCase()}, then try again.</p></div>`
    : '';
}

async function grant(kind: Kind) {
  try {
    const s = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: true } : { video: true });
    s.getTracks().forEach((t) => t.stop());
    showDevice(kind, 'granted');
    await toOffscreen({ type: meta[kind].msg });
    // The popup's "Allow" links land here, and one grant is not a finished setup:
    // move on to whatever is still unanswered rather than closing the page.
    goToNextStep();
  } catch (e) {
    showDevice(kind, 'denied', (e as Error).name);
  }
}

for (const kind of ['audio', 'video'] as const) {
  showDevice(kind, 'unknown');
  navigator.permissions?.query({ name: meta[kind].perm as PermissionName }).then((p) => {
    const apply = () => showDevice(kind, p.state === 'granted' ? 'granted' : p.state === 'denied' ? 'denied' : 'unknown');
    apply(); p.onchange = apply;
  }).catch(() => {});
}

// ---- ducking ---------------------------------------------------------------------------

const ducking = $<HTMLButtonElement>('ducking');
ducking.onclick = async () => {
  const enabled = ducking.getAttribute('aria-checked') !== 'true';
  ducking.setAttribute('aria-checked', String(enabled));
  await chrome.storage.local.set({ ducking: enabled });
  await toOffscreen({ type: 'setDucking', enabled });
};

// ---- connection address -----------------------------------------------------------------

function validUrl(v: string): boolean {
  try { const u = new URL(v.trim()); return ['wss:', 'ws:'].includes(u.protocol) && !!u.hostname && !u.username && !u.password; } catch { return false; }
}
function setFieldStatus(cls: '' | 'ok' | 'err' | 'busy', icon: 'ok' | 'err' | 'warn' | null, text: string) {
  serverStatus.className = `field-status ${cls}`;
  serverStatus.innerHTML = `${icon ? ic(icon, 'sm') : ''}${text}`;
}
function showProbe(st: ServerStatus | undefined) {
  if (!st) return;
  if (st.url === lastSaved) { state.serverState = st.state; showProgress(); }
  if (st.url !== urlInput.value.trim()) return;
  // A host's machine can be slow to wake, so an address that saved fine may not answer
  // the first time. Offer the retry here rather than making them save again to re-probe.
  retryBtn.hidden = st.state !== 'unreachable';
  if (st.state === 'checking') setFieldStatus('busy', 'warn', 'Checking…');
  else if (st.state === 'reachable') setFieldStatus('ok', 'ok', `Reachable${st.rttMs != null ? ` · answered in ${st.rttMs} ms` : ' · you’re connected to it'}`);
  else if (st.state === 'unreachable') setFieldStatus('err', 'err', 'Can’t reach it. Check the address, or that the host machine is awake.');
  else setFieldStatus('', null, '');
}

async function probe() {
  setFieldStatus('busy', 'warn', 'Checking…');
  showProbe(await toOffscreen<ServerStatus>({ type: 'probeServer' }));
}
function validate() {
  const v = urlInput.value.trim();
  const ok = validUrl(v);
  urlInput.setAttribute('aria-invalid', String(!ok && v.length > 0));
  saveBtn.disabled = !ok || v === lastSaved;
  saveBtn.classList.toggle('not-ready', saveBtn.disabled);
  if (!ok) setFieldStatus(v ? 'err' : '', v ? 'err' : null, v ? 'Enter an address beginning with wss:// or ws://.' : '');
  else if (v !== lastSaved) setFieldStatus('', null, 'Not saved yet.');
}
function setVisibility(show: boolean) {
  showServer = show;
  urlInput.type = show ? 'url' : 'password';
  eye.setAttribute('aria-pressed', String(show));
  eye.setAttribute('aria-label', show ? 'Hide address' : 'Show address');
  eye.innerHTML = show ? ic('eye') : ic('eyeOff');
}
eye.onclick = () => { setVisibility(!showServer); void chrome.storage.local.set({ showServerAddress: showServer }); };
retryBtn.onclick = () => { void probe(); };
urlInput.addEventListener('input', () => { retryBtn.hidden = true; validate(); });
$('server-form').onsubmit = async (e) => {
  e.preventDefault();
  const v = urlInput.value.trim();
  if (!validUrl(v)) { validate(); urlInput.focus(); return; }
  lastSaved = v;
  state.serverConfigured = true;
  showProgress();
  validate();
  setFieldStatus('busy', 'warn', 'Checking…');
  await toOffscreen({ type: 'setServerUrl', url: v });
  const snap = await toOffscreen<Snapshot>({ type: 'getSnapshot' });
  saveStatus.innerHTML = snap?.room
    ? `<span class="mini ok">${ic('ok', 'sm')}</span> Saved. Applies after you leave your current room.`
    : `<span class="mini ok">${ic('ok', 'sm')}</span> Address saved.`;
  saveStatus.style.color = 'var(--success)';
  setTimeout(() => { saveStatus.textContent = ''; }, 4000);
  await probe();
};

// ---- boot --------------------------------------------------------------------------------

$<HTMLAnchorElement>('host-guide').href = HOST_GUIDE_URL;

void chrome.storage.local.get(['serverUrl', 'ducking', 'showServerAddress']).then(async (v) => {
  // An address nobody saved is not an address: the field starts empty on a fresh
  // profile, even though DEFAULT_SERVER_URL is what a join would fall back to.
  state.serverConfigured = typeof v.serverUrl === 'string';
  lastSaved = state.serverConfigured ? (v.serverUrl as string) : '';
  urlInput.value = lastSaved;
  ducking.setAttribute('aria-checked', String(v.ducking === true));
  setVisibility(v.showServerAddress !== false);
  validate();
  booted = true;
  showProgress();
  showProbe(await toOffscreen<ServerStatus>({ type: 'probeServer' }));
});
// The popup has the same eye; keep the two in step while both are open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !('showServerAddress' in changes)) return;
  setVisibility(changes.showServerAddress!.newValue !== false);
});
if (wanted === 'camera') void grant('video');
else if (wanted) void grant('audio');

// ---- diagnostics ------------------------------------------------------------------------
// Assembled on demand from what is already in the browser: the offscreen document's
// snapshot and peer stats (if it is running) and each realm's ring buffer in session storage.

async function buildReport(): Promise<{ text: string; summary: string }> {
  const manifest = chrome.runtime.getManifest();
  const chromeVersion = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? '?';
  const [snapshot, peerStats, prefs, session] = await Promise.all([
    toOffscreen<Snapshot>({ type: 'getSnapshot' }),
    toOffscreen<Record<string, PeerStats>>({ type: 'getPeerStats' }),
    chrome.storage.local.get(['serverUrl', 'ducking']),
    chrome.storage.session.get(null).catch(() => ({} as Record<string, unknown>)),
  ]);

  const out: string[] = [
    'Gather & Join diagnostics',
    `generated: ${new Date().toISOString()}`,
    `extension: ${manifest.name} ${manifest.version}   chrome: ${chromeVersion}   platform: ${navigator.platform}`,
    `server: ${(prefs.serverUrl as string) ?? DEFAULT_SERVER_URL}   ducking: ${prefs.ducking === true ? 'on' : 'off'}`,
  ];
  let summary: string;
  if (!snapshot) {
    out.push('session: offscreen document not running (no room has been joined since Chrome started)');
    summary = 'Not in a room right now.';
  } else {
    const s = snapshot;
    const name = (id: string) => (id === s.yourPeerId ? 'you' : (s.peers.find((p) => p.peerId === id)?.name ?? id));
    out.push(
      `socket: ${s.socket}   reconnects: ${s.socketReconnects}   clock offset: ${Math.round(s.offsetMs)}ms   you: ${s.yourPeerId ?? '-'}`,
      `room: ${s.room ? `${s.room.code}   leader: ${name(s.room.leaderId)}   content: ${s.room.contentId ?? '-'}   ${s.room.paused ? 'paused' : 'playing'} at ${Math.round(s.room.positionMs)}ms` : '-'}`,
      `mic: ${s.micOn ? 'on' : 'off'} (${s.micPermission})   camera: ${s.camOn ? 'on' : 'off'} (${s.camPermission})   stalledBy: ${s.stalledBy?.name ?? '-'}   lastError: ${s.lastError ? `${s.lastError.code} ${s.lastError.message}` : '-'}`,
      `peers (${s.peers.length}):`,
    );
    for (const p of s.peers) {
      if (p.peerId === s.yourPeerId) continue;
      const m = s.peerMedia[p.peerId];
      const st = peerStats?.[p.peerId];
      out.push(`  ${p.peerId}  ${p.name}  ${m ? `${m.connectionState}/${m.iceConnectionState}/${m.signalingState}  audio=${m.hasAudio ? 'yes' : 'no'} video=${m.hasVideo ? 'yes' : 'no'}` : 'no connection'}${st ? `  rx=${kb(st.bytesReceived)} tx=${kb(st.bytesSent)} audioPackets=${st.audioPacketsReceived} frames=${st.framesDecoded}` : ''}`);
    }
    summary = s.room
      ? `In room ${s.room.code} with ${s.peers.length - 1} other${s.peers.length === 2 ? '' : 's'}; socket ${s.socket}, ${s.socketReconnects} reconnect${s.socketReconnects === 1 ? '' : 's'}.`
      : `Not in a room right now (socket ${s.socket}).`;
  }

  const logKeys = Object.keys(session).filter((k) => k.startsWith('gjLog:')).sort();
  for (const k of logKeys) {
    const lines = session[k];
    if (!Array.isArray(lines)) continue;
    out.push('', `--- log: ${k.slice('gjLog:'.length)} (${lines.length} lines) ---`, ...lines.map(String));
  }
  if (logKeys.length === 0) out.push('', '--- no log lines yet ---');
  return { text: out.join('\n'), summary };
}

const kb = (n: number) => `${(n / 1024).toFixed(0)}KB`;

async function refreshDiag() {
  const { text, summary } = await buildReport();
  $('diag-summary').textContent = summary;
  $('diag-preview').textContent = text;
  return text;
}

$('diag-refresh').onclick = () => { void refreshDiag(); };
$('diag-copy').onclick = async () => {
  const status = $('diag-status');
  const text = await refreshDiag();
  try {
    await navigator.clipboard.writeText(text);
    status.className = 'status';
    status.innerHTML = `${ic('ok', 'sm')} Copied ${text.split('\n').length} lines.`;
    setTimeout(() => { status.textContent = ''; }, 4000);
  } catch {
    status.className = 'status error';
    status.innerHTML = `${ic('err', 'sm')} Clipboard blocked. Open the preview and copy it by hand.`;
    ($('diag-preview').parentElement as HTMLDetailsElement).open = true;
  }
};
void refreshDiag();
