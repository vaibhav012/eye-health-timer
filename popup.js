// popup.js — Extension popup UI logic

const WORK_DURATION_SEC = 20 * 60; // 1 minute in seconds
const REST_DURATION_SEC = 20;       // 20 seconds

const phaseBadge   = document.getElementById('phase-badge');
const phaseText    = document.getElementById('phase-text');
const countdownEl  = document.getElementById('countdown');
const phaseLabelEl = document.getElementById('phase-label');
const progressBar  = document.getElementById('progress-bar');
const toggleBtn    = document.getElementById('toggle-btn');

let pollInterval = null;
let currentState = null;

// ── Formatting ─────────────────────────────────────────────────────────────

function formatMM_SS(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── UI Rendering ───────────────────────────────────────────────────────────

function renderUI(state) {
  if (!state || !state.running) {
    phaseBadge.className = 'phase-badge stopped';
    phaseText.textContent = 'Stopped';
    countdownEl.className = 'countdown';
    countdownEl.textContent = '--:--';
    phaseLabelEl.textContent = 'Press Start to begin';
    progressBar.className = 'progress-bar';
    progressBar.style.width = '0%';
    toggleBtn.textContent = 'Start Timer';
    toggleBtn.className = 'start';
    return;
  }

  const elapsed = Math.floor((Date.now() - state.phaseStartedAt) / 1000);

  if (state.phase === 'work') {
    const remaining = Math.max(WORK_DURATION_SEC - elapsed, 0);
    const progress = (remaining / WORK_DURATION_SEC) * 100;

    phaseBadge.className = 'phase-badge work';
    phaseText.textContent = 'Work';
    countdownEl.className = 'countdown';
    countdownEl.textContent = formatMM_SS(remaining);
    phaseLabelEl.textContent = 'Until next eye break';
    progressBar.className = 'progress-bar';
    progressBar.style.width = progress + '%';
  } else {
    // rest phase
    const remaining = Math.max(REST_DURATION_SEC - elapsed, 0);
    const progress = (remaining / REST_DURATION_SEC) * 100;

    phaseBadge.className = 'phase-badge rest';
    phaseText.textContent = 'Rest';
    countdownEl.className = 'countdown rest-phase';
    countdownEl.textContent = formatMM_SS(remaining);
    phaseLabelEl.textContent = 'Look 20 feet away!';
    progressBar.className = 'progress-bar rest';
    progressBar.style.width = progress + '%';
  }

  toggleBtn.textContent = 'Stop Timer';
  toggleBtn.className = 'stop';
}

// ── Polling ────────────────────────────────────────────────────────────────

function startPolling() {
  // Poll every second to update countdown
  pollInterval = setInterval(() => {
    if (currentState) renderUI(currentState);
  }, 1000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── Initial status fetch ───────────────────────────────────────────────────

chrome.runtime.sendMessage({ action: 'get-status' }, (state) => {
  if (chrome.runtime.lastError) return;
  currentState = state;
  renderUI(state);
  if (state && state.running) startPolling();
});

// ── Button handler ─────────────────────────────────────────────────────────

toggleBtn.addEventListener('click', () => {
  if (currentState && currentState.running) {
    chrome.runtime.sendMessage({ action: 'stop-timer' }, () => {
      currentState = { running: false };
      stopPolling();
      renderUI(currentState);
    });
  } else {
    chrome.runtime.sendMessage({ action: 'start-timer' }, () => {
      const now = Date.now();
      currentState = { running: true, phase: 'work', phaseStartedAt: now };
      renderUI(currentState);
      startPolling();
    });
  }
});

// ── Cleanup on popup close ─────────────────────────────────────────────────

window.addEventListener('unload', stopPolling);
