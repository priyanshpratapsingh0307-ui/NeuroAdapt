// clarity/background/service-worker.js — Phase 2

let sessionStart = Date.now();
let lastFatigueScore = 0;

// Tab-switch nudge tracking
const tabSwitchLog = {}; // windowId → [{ts}]

// ── Sidebar: open on icon click ───────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ── Tab switch tracking ───────────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  const now = Date.now();
  if (!tabSwitchLog[windowId]) tabSwitchLog[windowId] = [];
  tabSwitchLog[windowId].push({ ts: now });
  // Keep only last 3 minutes
  tabSwitchLog[windowId] = tabSwitchLog[windowId].filter(e => now - e.ts < 180000);
  const count = tabSwitchLog[windowId].length;
  if (count >= 6) {
    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_TOAST',
      message: `You've switched tabs ${count} times in 3 minutes. Try staying on one page.`,
      duration: 6000,
      actions: []
    }).catch(() => {});
  }
});

// ── Session alarms ────────────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'clarity-session-end') {
    // Notify sidebar that session ended
    chrome.runtime.sendMessage({ type: 'SESSION_COMPLETE' }).catch(() => {});
  }
});

// ── Message hub ───────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'CLARITY_METRICS': {
      const { metrics, fatigueScore } = msg.payload;
      lastFatigueScore = fatigueScore;
      chrome.storage.local.set({ lastMetrics: metrics, fatigueScore, lastUpdate: Date.now() });
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'CLARITY_METRICS_UPDATE', fatigueScore,
          sessionMinutes: metrics.sessionMinutes,
        }).catch(() => {});
      }
      // Forward to sidebar
      chrome.runtime.sendMessage({ type: 'CLARITY_METRICS', payload: msg.payload }).catch(() => {});
      updateBadge(fatigueScore);
      break;
    }

    case 'GET_STATUS':
      chrome.storage.local.get(
        ['lastMetrics', 'fatigueScore', 'focusModeActive', 'currentLevel'],
        data => sendResponse(data)
      );
      return true;

    case 'COMMAND_FOCUS_MODE':
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: 'ACTIVATE_FOCUS' }).catch(() => {});
      });
      break;

    case 'COMMAND_DEACTIVATE_FOCUS':
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: 'DEACTIVATE_FOCUS' }).catch(() => {});
      });
      break;

    case 'START_SESSION_ALARM':
      chrome.alarms.create('clarity-session-end', { delayInMinutes: msg.durationMin });
      break;

    case 'CLEAR_SESSION_ALARM':
      chrome.alarms.clear('clarity-session-end');
      break;

    case 'RESET_SESSION':
      sessionStart = Date.now();
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: 'RESET_SESSION' }).catch(() => {});
      });
      break;

    case 'RELAY_TO_TAB': {
      if (msg.tabId) chrome.tabs.sendMessage(msg.tabId, msg.message).catch(() => {});
      break;
    }
  }
});

// ── Badge ─────────────────────────────────────────────────────────────────────
function updateBadge(score) {
  let color, text;
  if      (score < 25) { color = '#6dbe8d'; text = '';  }
  else if (score < 50) { color = '#d4a84b'; text = '';  }
  else if (score < 75) { color = '#d47b4b'; text = '!'; }
  else                  { color = '#c96060'; text = '!!'; }
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}
