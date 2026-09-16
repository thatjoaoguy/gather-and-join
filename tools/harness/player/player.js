// Fake player. Deliberately hostile: it recreates <video> on quality switches
// and ad boundaries, routes episodes client-side via pushState, and runs an
// autoplay-next countdown per client, like the real thing.
(() => {
  const EPISODES = ['G0000001', 'G0000002', 'G0000003', 'G0000004', 'G0000005'];
  const playerEl = document.getElementById('player');
  const upNext = document.getElementById('up-next');
  const statusEl = document.getElementById('status');
  let generation = 0;
  let adTimer = null;
  let countdownTimer = null;

  const urnFromPath = () => (decodeURIComponent(location.pathname).match(/urn:hbo:episode:([A-Za-z0-9]+)/) || [])[1] || EPISODES[0];
  const nextUrn = () => EPISODES[(EPISODES.indexOf(urnFromPath()) + 1) % EPISODES.length];
  const video = () => playerEl.querySelector('video');

  function createVideo(src, { currentTime = 0, autoplay = false, loop = true } = {}) {
    const old = video();
    const wasPlaying = old ? !old.paused : autoplay;
    const volume = old ? old.volume : 1;
    if (old) { old.pause(); old.removeAttribute('src'); old.load(); old.remove(); }
    const v = document.createElement('video');
    v.dataset.generation = String(++generation);
    v.src = src;
    v.loop = loop;
    v.preload = 'auto';
    v.volume = volume;
    v.playsInline = true;
    v.style.width = '100%'; // like HBO Max: inline width the extension must restore, not remove
    playerEl.appendChild(v);
    v.addEventListener('loadedmetadata', () => { if (currentTime > 0) v.currentTime = currentTime; });
    if (wasPlaying) v.play().catch(() => {});
    return v;
  }

  function render() {
    document.getElementById('title').textContent = `Episode ${urnFromPath()}`;
    document.title = `Fake Player — ${urnFromPath()}`;
  }

  function goTo(urn, mode) {
    const url = `/watch/urn:hbo:episode:${urn}`;
    if (mode === 'load') { location.assign(url); return; }
    history.pushState({}, '', url);
    cancelCountdown();
    render();
    // SPA episode change: the player recreates the element from scratch.
    createVideo('/media/main', { autoplay: false });
  }

  function cancelCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    upNext.replaceChildren();
  }

  // Like HBO Max: the panel fills with a "Cancel autoplay" button and a countdown
  // that routes early. Dismiss cancels the early route only; the panel stays as a
  // manual "next" button, and the natural end of the episode still advances.
  function startCountdown() {
    if (countdownTimer || upNext.childElementCount) return;
    let secs = 10;
    upNext.innerHTML = '<div data-testid="player-ux-up-next-container">Next episode <span data-testid="player-ux-up-next-timer">' + secs + '</span>s '
      + '<button data-testid="player-ux-up-next-dismiss" aria-label="Cancel autoplay">Cancel autoplay</button> '
      + '<button data-testid="player-ux-up-next-button">Play next episode</button></div>';
    upNext.querySelector('[data-testid="player-ux-up-next-dismiss"]').onclick = () => { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } upNext.querySelector('[data-testid="player-ux-up-next-timer"]').textContent = '—'; };
    upNext.querySelector('[data-testid="player-ux-up-next-button"]').onclick = () => { cancelCountdown(); goTo(nextUrn(), 'push'); };
    countdownTimer = setInterval(() => {
      secs -= 1;
      const t = upNext.querySelector('[data-testid="player-ux-up-next-timer"]');
      if (t) t.textContent = String(secs);
      if (secs <= 0) { cancelCountdown(); goTo(nextUrn(), 'push'); }
    }, 1000);
  }

  // Controls
  document.getElementById('play').onclick = () => video()?.play();
  document.getElementById('pause').onclick = () => video()?.pause();
  document.getElementById('seek-back').onclick = () => { const v = video(); if (v) v.currentTime = Math.max(0, v.currentTime - 60); };
  document.getElementById('seek-fwd').onclick = () => { const v = video(); if (v) v.currentTime += 60; };
  document.getElementById('recreate').onclick = () => {
    const v = video();
    createVideo('/media/main', { currentTime: v ? v.currentTime : 0 });
  };
  document.getElementById('quality').onclick = () => {
    // Same as recreate, but through a detached-then-reattached node, which is
    // how some players do source switching.
    const v = video();
    const t = v ? v.currentTime : 0;
    const playing = v && !v.paused;
    if (v) v.remove();
    setTimeout(() => createVideo('/media/main', { currentTime: t, autoplay: !!playing }), 50);
  };
  document.getElementById('ad-break').onclick = () => {
    if (adTimer) return;
    const v = video();
    const resumeAt = v ? v.currentTime : 0;
    const wasPlaying = v && !v.paused;
    createVideo('/media/ad', { loop: false, autoplay: true });
    playerEl.dataset.adBreak = '1';
    adTimer = setTimeout(() => {
      adTimer = null;
      delete playerEl.dataset.adBreak;
      createVideo('/media/main', { currentTime: resumeAt, autoplay: !!wasPlaying });
    }, 15_000);
  };
  document.getElementById('next-push').onclick = () => goTo(nextUrn(), 'push');
  document.getElementById('next-load').onclick = () => goTo(nextUrn(), 'load');
  document.getElementById('show-up-next').onclick = startCountdown;
  // Like HBO Max: fullscreen is requested on the player container (a positioned element), not the <video>.
  document.getElementById('fullscreen').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else playerEl.requestFullscreen(); };
  window.addEventListener('popstate', () => { render(); createVideo('/media/main'); });

  // Autoplay-next fires 30s before the end, independently per client.
  setInterval(() => {
    const v = video();
    if (v && v.duration && !v.paused && v.duration - v.currentTime < 30) startCountdown();
  }, 1000);

  // Status readout (for humans looking at the page).
  setInterval(() => {
    const v = video();
    statusEl.textContent = v
      ? `gen=${v.dataset.generation} t=${v.currentTime.toFixed(2)} paused=${v.paused} rate=${v.playbackRate} vol=${v.volume.toFixed(2)} ad=${playerEl.dataset.adBreak || '0'}`
      : 'no video element';
  }, 250);

  // Page-level test helpers (the extension's __gaj hook is separate).
  window.__fakePlayer = { goTo, createVideo, startCountdown, video, generation: () => generation };

  render();
  createVideo('/media/main');
})();
