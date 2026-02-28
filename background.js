// background.js — Service Worker (MV3)
// Orchestrates the 20-20-20 timer using chrome.alarms (survives SW sleep)

const WORK_ALARM = 'work-phase-end';
const WORK_DURATION_MIN = 20;
const REST_DURATION_SEC = 20;

// ── State helpers ──────────────────────────────────────────────────────────

async function getState() {
  const data = await chrome.storage.local.get(['running', 'phase', 'phaseStartedAt']);
  return {
    running: data.running ?? false,
    phase: data.phase ?? 'work',
    phaseStartedAt: data.phaseStartedAt ?? null,
  };
}

async function setState(updates) {
  await chrome.storage.local.set(updates);
}

async function clearState() {
  await chrome.storage.local.remove(['running', 'phase', 'phaseStartedAt']);
}

// ── Timer lifecycle ────────────────────────────────────────────────────────

async function startTimer() {
  const now = Date.now();
  await setState({ running: true, phase: 'work', phaseStartedAt: now });
  await chrome.alarms.clear(WORK_ALARM);
  chrome.alarms.create(WORK_ALARM, { delayInMinutes: WORK_DURATION_MIN });
}

async function stopTimer() {
  await clearState();
  await chrome.alarms.clear(WORK_ALARM);
  broadcastToAllTabs({ action: 'hide-overlay' });
}

async function startRestPhase() {
  const now = Date.now();
  await setState({ phase: 'rest', phaseStartedAt: now });

  // Reschedule next work-phase-end immediately so the alarm is set
  // while we handle the rest phase client-side (alarms can't do < 1 min reliably)
  await chrome.alarms.clear(WORK_ALARM);
  chrome.alarms.create(WORK_ALARM, { delayInMinutes: WORK_DURATION_MIN });

  broadcastToAllTabs({ action: 'show-overlay', duration: REST_DURATION_SEC });
}

async function onRestPhaseComplete() {
  // content.js calls this after 20s countdown; transition back to work
  const now = Date.now();
  await setState({ phase: 'work', phaseStartedAt: now });
  // The alarm for the next work phase was already set in startRestPhase()
}

// ── Broadcast ──────────────────────────────────────────────────────────────

async function broadcastToAllTabs(msg) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    // Skip chrome:// and other restricted pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      continue;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, msg);
    } catch {
      // Tab may not have content script yet (e.g. new tab page, PDF)
      // Try injecting the script and CSS then retry
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['overlay.css'],
        });
        await chrome.tabs.sendMessage(tab.id, msg);
      } catch {
        // Silently skip tabs we can't reach (PDFs, sandboxed pages, etc.)
      }
    }
  }
}

// ── Event: Alarm ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== WORK_ALARM) return;
  const state = await getState();
  if (!state.running) return;

  // Alarm fires when work phase ends — start rest phase
  await startRestPhase();
});

// ── Event: Messages from popup / content scripts ───────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.action) {
      case 'start-timer':
        await startTimer();
        sendResponse({ ok: true });
        break;

      case 'stop-timer':
        await stopTimer();
        sendResponse({ ok: true });
        break;

      case 'get-status': {
        const state = await getState();
        sendResponse(state);
        break;
      }

      case 'rest-complete':
        await onRestPhaseComplete();
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ error: 'unknown action' });
    }
  })();
  // Return true to keep the message channel open for async sendResponse
  return true;
});

// ── Event: Tab loaded while rest phase is active ───────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) return;

  const state = await getState();
  if (!state.running || state.phase !== 'rest') return;

  const elapsed = Math.floor((Date.now() - state.phaseStartedAt) / 1000);
  const remaining = Math.max(REST_DURATION_SEC - elapsed, 0);
  if (remaining <= 0) return;

  // Give the page a moment to initialize content scripts
  setTimeout(async () => {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'show-overlay', duration: remaining });
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['overlay.css'] });
        await chrome.tabs.sendMessage(tabId, { action: 'show-overlay', duration: remaining });
      } catch {
        // Silently skip
      }
    }
  }, 500);
});
