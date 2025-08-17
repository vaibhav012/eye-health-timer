// content.js
// Injects and controls the full screen break overlay when instructed by background.js

let currentOverlay = null;
let countdownInterval = null;

function removeOverlay() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (currentOverlay && currentOverlay.parentNode) {
    currentOverlay.parentNode.removeChild(currentOverlay);
  }
  currentOverlay = null;
}

function createOverlay(durationSec) {
  if (currentOverlay) {
    removeOverlay();
  }

  const overlay = document.createElement('div');
  overlay.id = 'break-reminder-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-live', 'assertive');
  overlay.tabIndex = -1;

  const box = document.createElement('div');
  box.className = 'bro-box';

  const title = document.createElement('div');
  title.className = 'bro-title';
  title.textContent = 'Time for a 20 second break!';

  const ring = document.createElement('div');
  ring.className = 'bro-ring';

  const timeText = document.createElement('div');
  timeText.className = 'bro-time';

  const btn = document.createElement('button');
  btn.className = 'bro-skip';
  btn.textContent = 'Skip Break';
  btn.addEventListener('click', removeOverlay);

  box.appendChild(title);
  box.appendChild(ring);
  box.appendChild(timeText);
  box.appendChild(btn);
  overlay.appendChild(box);

  document.documentElement.appendChild(overlay);
  currentOverlay = overlay;

  // Start countdown
  let remaining = durationSec;
  timeText.textContent = `${remaining}s`;

  // Animate ring via CSS variable
  overlay.style.setProperty('--bro-duration', `${durationSec}s`);
  overlay.classList.add('bro-animate');

  countdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      removeOverlay();
    } else {
      timeText.textContent = `${remaining}s`
    }
  }, 1000);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'SHOW_OVERLAY') {
    const duration = Number(msg.durationSec) || 20;
    try {
      createOverlay(duration);
      sendResponse({ ok: true });
    } catch (e) {
      console.warn('Failed to create overlay', e);
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  }
  return true;
});

// Clean up on navigation or page hide
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    removeOverlay();
  }
});
window.addEventListener('beforeunload', removeOverlay);