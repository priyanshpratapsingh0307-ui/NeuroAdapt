// clarity/background/service-worker.js — Phase 2

let sessionStart = Date.now();
let lastFatigueScore = 0;
let currentHyperfocusState = false;

// Task Anchoring State
let activeTaskName = null;
let activeTaskAnchorId = null;
let taskWhitelist = new Set();

// Smart Blocklist State
let cachedBlocklistRules = [];
function fetchBlocklist() {
  chrome.storage.local.get(['userId'], (data) => {
    if (!data.userId) return;
    fetch('http://localhost:8000/api/blocklist/', {
      headers: { 'x-user-id': data.userId }
    }).then(r => r.json()).then(rules => {
      cachedBlocklistRules = Array.isArray(rules) ? rules : [];
    }).catch(() => {});
  });
}
// Initial fetch
setTimeout(fetchBlocklist, 1000);
// Fetch every 5 minutes
setInterval(fetchBlocklist, 5 * 60 * 1000);

// Tab-switch nudge tracking
const tabSwitchLog = {}; // windowId → [{ts}]

// ── Sidebar: open on icon click ───────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ── Tab switch tracking ───────────────────────────────────────────────────────
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  if (currentHyperfocusState) return; // Suppress nudges in hyperfocus
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
  if (level >= 3 && !tabSwitchWarningActive && !currentHyperfocusState) {
    tabSwitchWarningActive = true;
    chrome.tabs.sendMessage(tabId, { type: 'TAB_SWITCH_WARNING' }).catch(() => {});
    setTimeout(() => { tabSwitchWarningActive = false; }, 60000);
  }
  if (alarm.name === 'clarity-session-end') {
    // Notify sidebar that session ended
    chrome.runtime.sendMessage({ type: 'SESSION_COMPLETE' }).catch(() => {});
  }
});

// ── Task Drift & Smart Blocklist Detection ───────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && !currentHyperfocusState) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
    
    try {
      const urlObj = new URL(tab.url);
      const hostname = urlObj.hostname;

      if (activeTaskName && taskWhitelist.has(hostname)) return;

      // 1. Check Smart Blocklist Rules
      const rule = cachedBlocklistRules.find(r => hostname.includes(r.domain));
      if (rule) {
        let shouldBlock = false;
        
        if (rule.mode === 'hard') shouldBlock = true;
        else if (rule.mode === 'fatigue') {
          if (lastFatigueScore >= (rule.threshold || 65)) shouldBlock = true;
        }
        else if (rule.mode === 'time') {
          const hour = new Date().getHours();
          if (hour >= 9 && hour < 17) shouldBlock = true; // 9am - 5pm
        }
        else if (rule.mode === 'session') {
          if (activeTaskAnchorId) shouldBlock = true;
        }

        if (shouldBlock) {
          chrome.tabs.update(tabId, { url: chrome.runtime.getURL('blocked.html') });
          return; // Stop processing
        }
        
        if (rule.mode === 'soft') {
          chrome.tabs.sendMessage(tabId, { type: 'TRIGGER_SOFT_BLOCK' }).catch(() => {});
          // Do not return, allow drift detection to run as well
        }
      }

      // 2. Task Drift Detection
      if (activeTaskName) {
        const distractionDomains = ['youtube.com', 'reddit.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'netflix.com'];
        const isDistraction = distractionDomains.some(d => hostname.includes(d));

        if (isDistraction) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SHOW_DRIFT_ALERT',
            taskName: activeTaskName,
            siteUrl: tab.url,
            pageTitle: tab.title
          }).catch(() => {});

          if (activeTaskAnchorId) {
            chrome.storage.local.get(['userId'], (data) => {
              if (!data.userId) return;
              fetch('http://localhost:8000/api/tasks/drift', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': data.userId },
                body: JSON.stringify({
                  task_anchor_id: activeTaskAnchorId,
                  task_name: activeTaskName,
                  site_url: tab.url,
                  page_title: tab.title || '',
                  action_taken: 'alert_shown'
                })
              }).catch(() => {});
            });
          }
        }
      } // End of activeTaskName block
    } catch (e) {
      console.error(e);
    }
  }
});

// ── Message hub ───────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'CLARITY_METRICS': {
      const { metrics, fatigueScore } = msg.payload;
      lastFatigueScore = fatigueScore;
      currentHyperfocusState = metrics.isHyperfocused || false;
      chrome.storage.local.set({ lastMetrics: metrics, fatigueScore, lastUpdate: Date.now() });

      // ── Store daily fatigue for weekly tracking ──────────────────────────────
      const today = new Date().toISOString().slice(0, 10); // "2026-04-19"
      chrome.storage.local.get('weeklyFatigue', data => {
        const weekly = data.weeklyFatigue || {};
        if (!weekly[today]) weekly[today] = { scores: [], count: 0 };
        weekly[today].scores.push(fatigueScore);
        weekly[today].count++;
        // Keep only last 7 days
        const keys = Object.keys(weekly).sort();
        while (keys.length > 7) {
          delete weekly[keys.shift()];
        }
        chrome.storage.local.set({ weeklyFatigue: weekly });
      });

      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'CLARITY_METRICS_UPDATE', fatigueScore,
          sessionMinutes: metrics.sessionMinutes,
          isHyperfocused: metrics.isHyperfocused
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

    case 'DOM_SNAPSHOT': {
      // Forward the DOM snapshot from content script to sidebar for AI classification
      chrome.runtime.sendMessage({
        type: 'DOM_SNAPSHOT',
        elements: msg.elements,
        tabId: sender.tab?.id,
      }).catch(() => {});
      break;
    }

    case 'AUTO_SUMMARIZE_TRIGGER': {
      // Forward fast-scroll trigger from content script to sidebar
      chrome.runtime.sendMessage({ type: 'AUTO_SUMMARIZE_TRIGGER' }).catch(() => {});
      break;
    }

    case 'MUTE_ACTIVE_TAB': {
      if (sender.tab && sender.tab.id) {
        chrome.tabs.update(sender.tab.id, { muted: true }).catch(() => {});
      }
      break;
    }

    case 'UNMUTE_ACTIVE_TAB': {
      if (sender.tab && sender.tab.id) {
        chrome.tabs.update(sender.tab.id, { muted: false }).catch(() => {});
      }
      break;
    }

    case 'START_TASK_ANCHOR': {
      activeTaskName = msg.taskName;
      taskWhitelist.clear();
      chrome.storage.local.get(['userId'], (data) => {
        if (!data.userId) return;
        fetch('http://localhost:8000/api/tasks/anchor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': data.userId },
          body: JSON.stringify({ task_name: activeTaskName })
        }).then(r => r.json()).then(data => {
          if (data.task_anchor_id) activeTaskAnchorId = data.task_anchor_id;
        }).catch(() => {});
      });
      break;
    }

    case 'STOP_TASK_ANCHOR': {
      if (activeTaskAnchorId) {
        chrome.storage.local.get(['userId'], (data) => {
          if (!data.userId) return;
          fetch(`http://localhost:8000/api/tasks/anchor/${activeTaskAnchorId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': data.userId }
          }).catch(() => {});
        });
      }
      activeTaskName = null;
      activeTaskAnchorId = null;
      taskWhitelist.clear();
      break;
    }

    case 'WHITELIST_DOMAIN_FOR_TASK': {
      try {
        const urlObj = new URL(msg.url);
        taskWhitelist.add(urlObj.hostname);
      } catch (e) {}
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
