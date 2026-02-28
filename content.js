// content.js — Injected into every page
// Manages overlay creation, countdown, and removal

(function () {
  'use strict';

  const OVERLAY_ID = '__eye-rest-overlay__';
  const COUNTDOWN_ID = '__eye-rest-countdown__';
  const PROGRESS_ID = '__eye-rest-progress__';

  let overlayEl = null;
  let countdownInterval = null;

  // ── Overlay DOM ────────────────────────────────────────────────────────────

  function createOverlay(duration) {
    // Idempotent: if already showing, update duration and restart countdown
    if (overlayEl) {
      removeOverlay();
    }

    overlayEl = document.createElement('div');
    overlayEl.id = OVERLAY_ID;

    overlayEl.innerHTML = `
      <div class="__eye-rest-inner__">
        <div class="__eye-rest-icon__">
          <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="32" cy="32" rx="30" ry="18" fill="none" stroke="#8ab4f8" stroke-width="3"/>
            <circle cx="32" cy="32" r="10" fill="#4285f4"/>
            <circle cx="32" cy="32" r="5" fill="#1a1a2e"/>
            <circle cx="36" cy="28" r="2" fill="#ffffff" opacity="0.8"/>
          </svg>
        </div>
        <h1 class="__eye-rest-title__">Time to rest your eyes</h1>
        <p class="__eye-rest-subtitle__">Look at something <strong>20 feet away</strong></p>
        <div class="__eye-rest-timer__">
          <span id="${COUNTDOWN_ID}">${duration}</span>
          <span class="__eye-rest-unit__">seconds</span>
        </div>
        <div class="__eye-rest-progress-wrap__">
          <div id="${PROGRESS_ID}" class="__eye-rest-progress-bar__"></div>
        </div>
        <p class="__eye-rest-hint__">20-20-20 Rule &nbsp;·&nbsp; Next break in 20 minutes</p>
        <button id="__eye-rest-skip__">Skip</button>
      </div>
    `;

    document.body.appendChild(overlayEl);

    document.getElementById('__eye-rest-skip__').addEventListener('click', () => {
      removeOverlay();
      try {
        chrome.runtime.sendMessage({ action: 'rest-complete' });
      } catch {
        // Extension context may be invalidated; ignore
      }
    });

    startCountdown(duration);
  }

  function startCountdown(duration) {
    let remaining = duration;
    const countdownEl = document.getElementById(COUNTDOWN_ID);
    const progressEl = document.getElementById(PROGRESS_ID);

    function tick() {
      remaining -= 1;
      if (countdownEl) countdownEl.textContent = Math.max(remaining, 0);
      if (progressEl) {
        const pct = (remaining / duration) * 100;
        progressEl.style.width = Math.max(pct, 0) + '%';
      }
      if (remaining <= 0) {
        removeOverlay();
        // Notify background that rest phase is done
        try {
          chrome.runtime.sendMessage({ action: 'rest-complete' });
        } catch {
          // Extension context may be invalidated; ignore
        }
      }
    }

    // Immediate first tick render (progress starts at 100%)
    if (progressEl) progressEl.style.width = '100%';

    countdownInterval = setInterval(tick, 1000);
  }

  function removeOverlay() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  // ── Message listener ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case 'show-overlay':
        createOverlay(msg.duration ?? 20);
        sendResponse({ ok: true });
        break;
      case 'hide-overlay':
        removeOverlay();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ error: 'unknown action' });
    }
  });

  // ── On load: check if we joined mid-rest ──────────────────────────────────

  try {
    chrome.runtime.sendMessage({ action: 'get-status' }, (state) => {
      if (chrome.runtime.lastError) return; // Extension reloaded or unavailable
      if (state && state.running && state.phase === 'rest') {
        const elapsed = Math.floor((Date.now() - state.phaseStartedAt) / 1000);
        const remaining = Math.max(20 - elapsed, 0);
        if (remaining > 0) {
          createOverlay(remaining);
        }
      }
    });
  } catch {
    // Silently ignore if extension context is not available
  }
})();
