// clarity/background/service-worker.js

// ── Session timer ─────────────────────────────────────────────────────────────
let sessionStart = Date.now();
let lastFatigueScore = 0;

// ── Message hub ───────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'CLARITY_METRICS': {
      const { metrics, fatigueScore } = msg.payload;
      lastFatigueScore = fatigueScore;

      // Persist latest metrics
      chrome.storage.local.set({
        lastMetrics: metrics,
        fatigueScore,
        lastUpdate: Date.now(),
      });

      // Forward to the tab's content script for live adaptation
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'CLARITY_METRICS_UPDATE',
          fatigueScore,
          sessionMinutes: metrics.sessionMinutes,
        }).catch(() => {});
      }

      // Update badge
      updateBadge(fatigueScore);
      break;
    }

    case 'GET_STATUS':
      chrome.storage.local.get(
        ['lastMetrics', 'fatigueScore', 'focusModeActive', 'currentLevel'],
        (data) => sendResponse(data)
      );
      return true; // async

    case 'COMMAND_FOCUS_MODE':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'ACTIVATE_FOCUS' }).catch(() => {});
        }
      });
      break;

    case 'COMMAND_DEACTIVATE_FOCUS':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'DEACTIVATE_FOCUS' }).catch(() => {});
        }
      });
      break;

    case 'COMMAND_SUMMARIZE':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_SUMMARY' }).catch(() => {});
        }
      });
      break;

    case 'RESET_SESSION':
      sessionStart = Date.now();
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'RESET_SESSION' }).catch(() => {});
        }
      });
      break;
  }
});

// ── Badge color feedback ───────────────────────────────────────────────────────
function updateBadge(score) {
  let color, text;
  if (score < 25)      { color = '#4ade80'; text = ''; }
  else if (score < 50) { color = '#facc15'; text = ''; }
  else if (score < 75) { color = '#fb923c'; text = '!'; }
  else                  { color = '#f87171'; text = '!!'; }

  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}
