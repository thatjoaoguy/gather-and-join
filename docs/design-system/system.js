const $ = (id) => document.getElementById(id);
let busy = false;
const status = (id, message, error = false) => { $(id).textContent = message; $(id).classList.toggle('error', error); };
function roomControls(enabled) { for (const id of ['mic', 'cam', 'copy', 'leave']) $(id).disabled = !enabled; }
async function enter(create) {
  if (busy) return;
  const name = $('your-name').value.trim() || 'Someone';
  const code = $('room-code').value.trim().toUpperCase();
  const invalid = !create && !/^[A-Z0-9]{6}$/.test(code);
  $('room-code').setAttribute('aria-invalid', String(invalid));
  if (invalid) { status('join-status', 'Enter the six-character code from your friend.', true); $('room-code').focus(); return; }
  busy = true; $('join').disabled = true; $('create').disabled = true;
  const button = create ? $('create') : $('join');
  button.textContent = create ? 'Creating…' : 'Joining…';
  status('join-status', create ? 'Creating your room…' : 'Joining your room…');
  await new Promise(resolve => setTimeout(resolve, 650));
  $('active-code').textContent = create ? 'G7K2MX' : code;
  $('self-name').textContent = `${name} (you)`;
  $('room-role').textContent = create ? 'Host' : 'Guest';
  $('room-status').textContent = '3 people in the room · Preview participants.';
  status('copy-status', '');
  status('join-status', create ? 'Room created. Share the code with a friend.' : 'You’re in. Your room preview is ready.');
  roomControls(true);
  $('join').disabled = false; $('create').disabled = false;
  $('join').textContent = 'Join room'; $('create').textContent = 'Create a room'; busy = false;
}
$('join-form').addEventListener('submit', e => { e.preventDefault(); void enter(false); });
$('create').onclick = () => void enter(true);
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('active-code').textContent); status('copy-status', 'Room code copied.'); }
  catch { status('copy-status', 'Clipboard unavailable. Select and copy the code above.'); const range = document.createRange(); range.selectNodeContents($('active-code')); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
};
$('mic').onclick = () => { const on = $('mic').getAttribute('aria-pressed') !== 'true'; $('mic').setAttribute('aria-pressed', String(on)); $('mic').textContent = on ? 'Mic on' : 'Mic off'; $('self-state').textContent = on ? 'Microphone on' : 'Microphone off'; status('room-status', on ? 'Your microphone is on · Preview.' : 'Your microphone is muted · Preview.'); };
$('cam').onclick = () => { const on = $('cam').getAttribute('aria-pressed') !== 'true'; $('cam').setAttribute('aria-pressed', String(on)); $('cam').textContent = on ? 'Camera on' : 'Camera off'; status('room-status', on ? 'Camera enabled in this preview. No device was accessed.' : 'Camera off · Preview.'); };
$('leave').onclick = () => { roomControls(false); status('room-status', 'You left the room. Join or create to try again.'); status('copy-status', 'Preview ended.'); };
for (const type of ['mic', 'cam']) $(`allow-${type}`).onclick = () => { $(`${type}-permission`).textContent = 'Access allowed · Simulated for review.'; $(`allow-${type}`).textContent = 'Allowed'; $(`allow-${type}`).disabled = true; status('device-status', 'Permission preview only. Your devices have not been accessed.'); };
$('ducking').onchange = () => status('device-status', $('ducking').checked ? 'Volume lowering enabled · Preview only.' : 'Volume lowering disabled · Preview only.');
$('server-form').onsubmit = e => { e.preventDefault(); let valid = false; try { const url = new URL($('server-url').value.trim()); valid = ['wss:', 'ws:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; } catch {} $('server-url').setAttribute('aria-invalid', String(!valid)); status('server-status', valid ? 'Address saved in this preview. Applies to your next room.' : 'Enter a connection address beginning with wss:// or ws://.', !valid); if (!valid) $('server-url').focus(); };
const watchMessages = { normal: 'Everyone is connected.', buffering: 'Alex is buffering. The show is paused. Press play when everyone is ready.', reconnecting: 'Reconnecting to your room… We’re trying again.', episode: 'Your room is watching another episode. Go to the room’s episode to join them.' };
$('watch-state').onchange = () => status('watch-status', watchMessages[$('watch-state').value]);
$('speaker').onclick = () => { const on = $('speaker').getAttribute('aria-pressed') !== 'true'; $('speaker').setAttribute('aria-pressed', String(on)); $('speaker').textContent = on ? 'Speaking indicator on' : 'Speaking indicator off'; $('speaker-tile').classList.toggle('speaking', on); $('speaker-label').textContent = on ? 'Speaking' : 'Camera off'; };
document.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => status('component-status', b.dataset.demo));
$('replay').onclick = () => { $('arrival').hidden = false; $('arrival').classList.remove('progress'); void $('arrival').offsetWidth; $('arrival').classList.add('progress'); };
$('reduced').onchange = () => document.body.classList.toggle('reduce', $('reduced').checked);
