// background.js
// Service worker for timing and state coordination
// Uses chrome.alarms for reliable timing and chrome.storage for state.
// Default cycle: 20 minutes of work, then 20 second overlay break.

const ALARM_NAME = 'breakAlarm';
const WORK_INTERVAL_MIN = 20;
const BREAK_DURATION_SEC = 20;

// Initialize state in storage if missing
async function initState() {
  const { running } = await chrome.storage.local.get({ running: false });
  if (running) {
    // Ensure an alarm exists
    const alarm = await chrome.alarms.get(ALARM_NAME);
    if (!alarm) {
      await scheduleAlarm(WORK_INTERVAL_MIN);
    }
  } else {
    // Not running. Clear any stray alarm to be safe.
    await chrome.alarms.clear(ALARM_NAME);
  }
  await chrome.storage.local.set({ breakDurationSec: BREAK_DURATION_SEC });
}

async function scheduleAlarm(delayMinutes) {
  const when = Date.now() + delayMinutes * 60 * 1000;
  await chrome.alarms.create(ALARM_NAME, { when });
  await chrome.storage.local.set({ running: true, nextWhen: when });
}

async function startTimer() {
  // If already running, do nothing
  const alarm = await chrome.alarms.get(ALARM_NAME);
  if (alarm) {
    const nextWhen = alarm.scheduledTime;
    await chrome.storage.local.set({ running: true, nextWhen });
    return;
  }
  await scheduleAlarm(WORK_INTERVAL_MIN);
}

async function pauseTimer() {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.set({ running: false, nextWhen: null });
}

async function resetTimer() {
  await chrome.alarms.clear(ALARM_NAME);
  await scheduleAlarm(WORK_INTERVAL_MIN);
}

async function showOverlayOnActiveTab() {
  // Find the active tab in the focused window
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tabs && tabs[0] && tabs[0].id !== undefined) {
    try {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_OVERLAY', durationSec: BREAK_DURATION_SEC });
    } catch (e) {
      // Content script may not be ready on some special pages
      console.warn('Failed to send SHOW_OVERLAY to tab. It may be a restricted page or not ready yet.', e);
    }
  }
}

// Handle the alarm firing
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  // When the work interval ends, trigger overlay on active tab
  await showOverlayOnActiveTab();

  // Schedule the next cycle immediately for 20 minutes later
  await scheduleAlarm(WORK_INTERVAL_MIN);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === 'START_TIMER') {
      await startTimer();
      sendResponse({ ok: true });
    } else if (msg && msg.type === 'PAUSE_TIMER') {
      await pauseTimer();
      sendResponse({ ok: true });
    } else if (msg && msg.type === 'RESET_TIMER') {
      await resetTimer();
      sendResponse({ ok: true });
    } else if (msg && msg.type === 'GET_STATUS') {
      const alarm = await chrome.alarms.get(ALARM_NAME);
      const { running } = await chrome.storage.local.get({ running: false });
      let timeRemainingMs = null;
      if (alarm) {
        timeRemainingMs = Math.max(0, alarm.scheduledTime - Date.now());
      }
      sendResponse({
        ok: true,
        running,
        timeRemainingMs
      });
    }
  })();
  return true; // Keep message channel open for async sendResponse
});

// Recreate or clear alarm on startup or install as needed
chrome.runtime.onInstalled.addListener(initState);
chrome.runtime.onStartup.addListener(initState);

// For safety, update nextWhen when alarms are created
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    // next alarm scheduled in handler above
  }
});