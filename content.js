// content.js — Injected into every page
// Manages overlay creation, countdown, and removal

(function () {
  'use strict';

  const OVERLAY_ID = '__eye-rest-overlay__';
  const COUNTDOWN_ID = '__eye-rest-countdown__';
  const PROGRESS_ID = '__eye-rest-progress__';

  let overlayEl = null;
  let countdownInterval = null;
  let visibilityListener = null;

  // ── Overlay DOM ────────────────────────────────────────────────────────────

  function createOverlay(duration, startWhenFocused) {
    // Idempotent: if already showing, update duration and restart countdown
    if (overlayEl) {
      removeOverlay();
    }

    overlayEl = document.createElement('div');
    overlayEl.id = OVERLAY_ID;

    overlayEl.innerHTML = `
      <div class="__eye-rest-inner__">
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

    if (startWhenFocused && document.visibilityState !== 'visible') {
      // Start countdown only when this tab gets focus
      visibilityListener = function onVisible() {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', visibilityListener);
        visibilityListener = null;
        startCountdown(duration);
      };
      document.addEventListener('visibilitychange', visibilityListener);
    } else {
      startCountdown(duration);
    }
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
    if (visibilityListener) {
      document.removeEventListener('visibilitychange', visibilityListener);
      visibilityListener = null;
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
        createOverlay(msg.duration ?? 20, msg.startWhenFocused === true);
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
          createOverlay(remaining, true);
        }
      }
    });
  } catch {
    // Silently ignore if extension context is not available
  }
})();
