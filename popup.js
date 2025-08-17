// popup.js
const countdownEl = document.getElementById('countdown');
const statusChip = document.getElementById('statusChip');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

function msToMMSS(ms) {
  if (ms == null) return '--:--';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

async function refreshStatus() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  if (res && res.ok) {
    statusChip.textContent = res.running ? 'Running' : 'Paused';
    countdownEl.textContent = msToMMSS(res.timeRemainingMs);
  } else {
    statusChip.textContent = 'Unknown';
    countdownEl.textContent = '--:--';
  }
}

startBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'START_TIMER' });
  await refreshStatus();
});

pauseBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
  await refreshStatus();
});

resetBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'RESET_TIMER' });
  await refreshStatus();
});

// Poll status every second while popup is open
let poller = null;
function startPolling() {
  if (poller) return;
  poller = setInterval(refreshStatus, 1000);
}
function stopPolling() {
  if (!poller) return;
  clearInterval(poller);
  poller = null;
}

document.addEventListener('DOMContentLoaded', () => {
  refreshStatus();
  startPolling();
});
window.addEventListener('unload', stopPolling);