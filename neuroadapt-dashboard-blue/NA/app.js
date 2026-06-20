const BACKEND_URL = 'http://127.0.0.1:8000';

/* ─── STORAGE UTILITY ───────────────────────────────────── */
/**
 * Safely retrieves the userId from chrome.storage.local.
 * Falls back to localStorage for local web development (e.g. Live Server).
 */
async function getUserId() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await new Promise(resolve => {
        chrome.storage.local.get(['userId'], (result) => {
          if (chrome.runtime.lastError) resolve({});
          else resolve(result);
        });
      });
      if (data.userId) return data.userId;
    }
  } catch (e) {
    console.warn("Chrome storage not available, falling back to localStorage.");
  }

  // Fallback for development/testing outside of Chrome Extension context
  let localId = localStorage.getItem('neuroadapt_dev_user_id');
  if (!localId) {
    localId = 'dashboard-test-user'; // Default ID for local preview
    localStorage.setItem('neuroadapt_dev_user_id', localId);
  }
  return localId;
}

/**
 * Safely retrieves other data from storage
 */
async function getStorageData(keys) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return await new Promise(resolve => {
        chrome.storage.local.get(keys, resolve);
      });
    }
  } catch (e) { }

  const fallback = {};
  keys.forEach(k => {
    const val = localStorage.getItem('neuroadapt_' + k);
    if (val) {
      try { fallback[k] = JSON.parse(val); }
      catch { fallback[k] = val; }
    }
  });
  return fallback;
}


/* ─── NAVIGATION ───────────────────────────────────────── */
function nav(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');

  const map = { dashboard: 0, scoredetail: 0, history: 1, help: 2, settings: 3 };
  if (map[id] !== undefined) {
    document.querySelectorAll('.nav-btn')[map[id]].classList.add('active');
  }

  document.querySelector('.main').scrollTo(0, 0);
  requestAnimationFrame(() => {
    if (typeof resizeAllCharts === 'function') resizeAllCharts();
  });
}


/* ─── SESSION HISTORY LIST ─────────────────────────────── */
let sessions = [];

async function buildHistoryList() {
  const histEl = document.getElementById('histList');
  if (!histEl) return;

  try {
    const userId = await getUserId();
    const resp = await fetch(`${BACKEND_URL}/api/sessions?limit=10`, {
      headers: { 'x-user-id': userId }
    });

    if (resp.ok) {
      const data = await resp.json();
      sessions = data.map(s => {
        const d = new Date(s.timestamp);
        const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const score = Math.round(s.fatigue_score);
        const status = score >= 70 ? 'Strained' : score >= 50 ? 'Fragile' : 'Healthy';
        return {
          date: dateStr,
          score: score,
          status: status,
          dur: `${Math.round(s.duration_mins)} min`,
          wpm: Math.round(s.wpm),
          err: Math.round(s.error_rate * 100) || 0
        };
      });
    }
  } catch (e) {
    console.error("Failed to fetch session history", e);
  }

  histEl.innerHTML = '';
  if (sessions.length === 0) {
    histEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text3);">No past sessions found. Try completing a focus session in the extension!</div>';
    return;
  }

  sessions.forEach(s => {
    const col = s.score >= 70 ? 'var(--danger)' : s.score >= 50 ? 'var(--warn)' : 'var(--ok)';
    const bcls = s.score >= 70 ? 'badge-danger' : s.score >= 50 ? 'badge-warn' : 'badge-ok';

    const div = document.createElement('div');
    div.className = 'hist-row';
    div.innerHTML = `
      <div class="hist-dot" style="background:${col}"></div>
      <div class="hist-date">${s.date}</div>
      <div class="hist-score" style="color:${col}">${s.score}</div>
      <div class="hist-bars">
        <div class="hbar-row">
          <span class="hbar-l">WPM</span>
          <div class="hbar-t">
            <div class="hbar-f" style="width:${Math.min(100, Math.round(s.wpm / 60 * 100))}%;background:var(--teal)"></div>
          </div>
          <span class="hbar-v">${s.wpm}</span>
        </div>
        <div class="hbar-row">
          <span class="hbar-l">Err</span>
          <div class="hbar-t">
            <div class="hbar-f" style="width:${Math.min(100, s.err)}%;background:${col}"></div>
          </div>
          <span class="hbar-v">${s.err}%</span>
        </div>
      </div>
      <div class="hist-right">
        <span class="hist-dur">${s.dur}</span>
        <span class="badge ${bcls}">${s.status}</span>
      </div>
    `;
    histEl.appendChild(div);
  });
}


/* ─── DASHBOARD DATA ───────────────────────────────────── */
async function fetchDashboardData() {
  try {
    const userId = await getUserId();
    const resp = await fetch(`${BACKEND_URL}/api/dashboard/`, {
      headers: { 'x-user-id': userId }
    });
    if (!resp.ok) return;

    const data = await resp.json();

    // Update Ring
    const score = Math.round(data.current_score);
    const ring = document.getElementById('scoreRing');
    const num = document.getElementById('scoreNum');
    const badge = document.getElementById('scoreBadge');

    if (ring) {
      const circ = 389.6;
      const offset = circ - (score / 100) * circ;
      ring.style.strokeDashoffset = offset;
      const color = score >= 70 ? 'var(--danger)' : score >= 50 ? 'var(--warn)' : 'var(--teal)';
      ring.style.stroke = color;
      if (num) {
        num.textContent = score;
        num.style.color = color;
      }
    }

    if (badge) {
      badge.textContent = data.current_status.charAt(0).toUpperCase() + data.current_status.slice(1);
      badge.className = `badge badge-${data.current_status === 'strained' ? 'danger' : data.current_status === 'fragile' ? 'warn' : 'ok'}`;
    }

    // Update Stat Cards
    if (document.getElementById('avg-score-7d')) document.getElementById('avg-score-7d').textContent = data.avg_score_7d;
    if (document.getElementById('total-sessions')) document.getElementById('total-sessions').textContent = data.total_sessions;
    if (document.getElementById('worst-site')) document.getElementById('worst-site').textContent = data.worst_site ? data.worst_site.split('//')[1]?.split('/')[0] || 'Unknown' : 'None';

    // Update AI Alert
    if (data.latest_suggestion) {
      if (document.getElementById('alert-title')) document.getElementById('alert-title').textContent = "AI Recommendation";
      if (document.getElementById('alert-body')) document.getElementById('alert-body').textContent = data.latest_suggestion;
    }

    // Update Trend Chart
    if (typeof initTrendChart === 'function') {
      initTrendChart(data.trend);
    }

    // Update Score Detail History Chart
    if (typeof initHistDetailChart === 'function') {
      const historyFormatted = sessions.slice(0, 7).reverse().map(s => ({
        date: s.date.split(',')[0],
        score: s.score
      }));
      if (historyFormatted.length > 0) initHistDetailChart(historyFormatted);
    }

  } catch (e) {
    console.error("Dashboard hydration failed", e);
  }
}

/* ─── AI RECOMMENDATIONS (Weekly Plan) ───────────────────── */
async function generateAIPlan() {
  const container = document.getElementById('ai-recs-container');
  const btn = document.getElementById('btn-refresh-ai');
  if (!container || !btn) return;

  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Loading...`;
  btn.style.opacity = '0.7';
  btn.disabled = true;

  try {
    const userId = await getUserId();

    // Fetch last 10 sessions to summarize
    const sessionResp = await fetch(`${BACKEND_URL}/api/sessions?limit=10`, {
      headers: { 'x-user-id': userId }
    });
    const sessionData = await sessionResp.json();
    const dataStr = sessionData.length > 0
      ? sessionData.map(s => `Score: ${s.fatigue_score}, Site: ${s.site_url}`).join('\n')
      : "No session data found yet.";

    const resp = await fetch(`${BACKEND_URL}/api/ollama/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ mode: 'recommend', user_message: dataStr }),
    });

    if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
    const result = await resp.json();

    let steps = [];
    try {
      let cleaned = result.reply.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      steps = JSON.parse(cleaned);
      if (!Array.isArray(steps)) {
        const arrMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrMatch) steps = JSON.parse(arrMatch[0]);
      }
    } catch {
      const arrMatch = result.reply.match(/\[[\s\S]*\]/);
      if (arrMatch) steps = JSON.parse(arrMatch[0]);
    }

    if (!Array.isArray(steps)) throw new Error('AI failed to provide structured steps.');

    container.innerHTML = '';
    steps.forEach((step, i) => {
      const pColor = step.priority === 'high' ? 'var(--danger)' : step.priority === 'medium' ? 'var(--warn)' : 'var(--teal)';
      const pBg = step.priority === 'high' ? 'var(--danger-dim)' : step.priority === 'medium' ? 'var(--warn-dim)' : 'rgba(58,170,212,0.1)';

      container.innerHTML += `
        <div style="background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:12px 16px; display:flex; gap:14px; align-items:flex-start;">
          <div style="background:${pBg}; color:${pColor}; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0;">${i + 1}</div>
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <div style="font-weight:600; color:var(--text1);">${step.title}</div>
              <span class="badge" style="font-size:10px; padding:2px 6px; background:${pBg}; color:${pColor}; border:1px solid ${pColor}30;">${step.priority}</span>
            </div>
            <div style="font-size:13px; color:var(--text2); line-height:1.5;">${step.description}</div>
          </div>
        </div>
      `;
    });

  } catch (err) {
    console.error("AI Recommendation failed:", err);
    container.innerHTML = `<div style="color:var(--danger); padding:10px; background:var(--danger-dim); border-radius:6px; font-size:13px;">Plan generation skipped. (${err.message})</div>`;
  } finally {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 102.6-6.4L2 8"/></svg> Refresh Plan`;
    btn.style.opacity = '1'; btn.disabled = false;
  }
}

async function fetchUserData() {
  try {
    const userId = await getUserId();
    const storageData = await getStorageData(['sessionStartTime']);

    const resp = await fetch(`${BACKEND_URL}/api/users/me`, {
      headers: { 'x-user-id': userId }
    });

    if (resp.ok) {
      const user = await resp.json();
      const name = user.name || 'User';
      const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

      if (document.getElementById('sidebar-name')) document.getElementById('sidebar-name').textContent = name;
      if (document.getElementById('sidebar-avatar')) document.getElementById('sidebar-avatar').textContent = initials;
      if (document.getElementById('greeting-title')) document.getElementById('greeting-title').textContent = `Good afternoon, ${name}`;
      if (document.getElementById('report-title')) document.getElementById('report-title').textContent = `Session report · ${name}`;
    }

    if (storageData.sessionStartTime) {
      const mins = Math.max(0, Math.floor((Date.now() - storageData.sessionStartTime) / 60000));
      if (document.getElementById('sidebar-meta')) document.getElementById('sidebar-meta').textContent = `Active · ${mins} min session`;
      const gMeta = document.getElementById('greeting-meta');
      if (gMeta) {
        const d = new Date();
        gMeta.innerHTML = `<span class="live-dot"></span>&nbsp;Live monitoring · Session started ${mins} min ago · ${d.toDateString()}`;
      }
    }
  } catch (e) {
    console.error("Failed to fetch user profile", e);
  }
}


/* ─── CLINICAL SUMMARY ─────────────────────────────────── */
async function fetchClinicalSummary() {
  const summaryEl = document.getElementById('report-summary');
  if (!summaryEl) return;

  try {
    const userId = await getUserId();

    // Fetch last session for context
    const sessionResp = await fetch(`${BACKEND_URL}/api/sessions?limit=1`, {
      headers: { 'x-user-id': userId }
    });
    const sessions = await sessionResp.json();
    if (sessions.length === 0) {
      summaryEl.textContent = "No session data available for summary.";
      return;
    }

    const s = sessions[0];
    const context = `Session Duration: ${s.duration_mins}m, Fatigue Score: ${s.fatigue_score}, WPM: ${s.wpm}, Error Rate: ${s.error_rate}, Scroll Rate: ${s.scroll_rate}.`;

    const resp = await fetch(`${BACKEND_URL}/api/ollama/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({
        mode: 'chat',
        user_message: `Based on this session data, write a 2-3 sentence clinical summary of the user's cognitive state: ${context}`
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      summaryEl.textContent = data.reply;
    }
  } catch (e) {
    console.error("Clinical summary failed", e);
    summaryEl.textContent = "Unable to generate summary at this time.";
  }
}


/* ─── SETTINGS LOGIC ───────────────────────────────────── */
async function fetchSettings() {
  try {
    const userId = await getUserId();
    const resp = await fetch(`${BACKEND_URL}/api/settings/`, {
      headers: { 'x-user-id': userId }
    });
    if (!resp.ok) return;

    const settings = await resp.json();

    // Update Toggles
    const toggleMap = {
      'high-contrast-toggle': settings.high_contrast,
      'larger-targets-toggle': settings.larger_targets,
      'focus-mode-toggle-settings': settings.focus_mode_enabled,
      'ui-simplification-toggle': settings.ui_simplification,
      'break-reminders-toggle': settings.break_reminders,
      'strained-alerts-toggle': settings.strained_alerts,
      'store-history-toggle': settings.store_history,
    };

    for (const [id, val] of Object.entries(toggleMap)) {
      const el = document.getElementById(id);
      if (el) {
        if (val) el.classList.add('on');
        else el.classList.remove('on');
      }
    }

    // Update Sliders
    updateSliderUI('typing-weight-slider', 'tw-v', settings.typing_weight, '%');
    updateSliderUI('scroll-weight-slider', 'sw-v', settings.scroll_weight, '%');
    updateSliderUI('alert-threshold-slider', 'at-v', settings.strained_threshold, '');

  } catch (e) {
    console.error("Failed to fetch settings", e);
  }
}

function updateSliderUI(id, valId, val, unit) {
  const el = document.getElementById(id);
  const vEl = document.getElementById(valId);
  if (el) el.value = val;
  if (vEl) vEl.textContent = val + unit;
}

async function saveSetting(key, value) {
  try {
    const userId = await getUserId();
    const payload = {};
    payload[key] = value;

    const resp = await fetch(`${BACKEND_URL}/api/settings/`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify(payload)
    });

    if (resp.ok) {
      console.log(`Setting saved: ${key} = ${value}`);
      // Notify extension background script about setting change
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', key, value });
      }
    }
  } catch (e) {
    console.error("Failed to save setting", e);
  }
}

async function deleteAllData() {
  if (!confirm("ARE YOU SURE? This will permanently delete your profile, all sessions, settings, and AI history. This cannot be undone.")) return;

  try {
    const userId = await getUserId();
    const resp = await fetch(`${BACKEND_URL}/api/users/`, {
      method: 'DELETE',
      headers: { 'x-user-id': userId }
    });

    if (resp.ok) {
      alert("All data has been deleted. The application will now reset.");
      // Clear local storage and reload
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.clear(() => {
          window.location.reload();
        });
      } else {
        localStorage.clear();
        window.location.reload();
      }
    }
  } catch (e) {
    console.error("Failed to delete data", e);
    alert("Error deleting data. Please check your connection.");
  }
}

function initSettingsListeners() {
  // Toggles
  const toggles = [
    { id: 'larger-font-toggle', key: 'larger_targets' },
    { id: 'reduce-motion-toggle', key: 'ui_simplification' },
    { id: 'high-contrast-toggle', key: 'high_contrast' },
    { id: 'larger-targets-toggle', key: 'larger_targets' },
    { id: 'focus-mode-toggle-settings', key: 'focus_mode_enabled' },
    { id: 'ui-simplification-toggle', key: 'ui_simplification' },
    { id: 'break-reminders-toggle', key: 'break_reminders' },
    { id: 'strained-alerts-toggle', key: 'strained_alerts' },
    { id: 'store-history-toggle', key: 'store_history' },
    { id: 'analytics-toggle', key: 'store_history' }
  ];

  toggles.forEach(t => {
    const el = document.getElementById(t.id);
    if (el) {
      el.addEventListener('click', () => {
        const isOn = el.classList.toggle('on');
        saveSetting(t.key, isOn);
      });
    }
  });

  // Sliders
  const sliders = [
    { id: 'typing-weight-slider', key: 'typing_weight', valId: 'tw-v', unit: '%' },
    { id: 'scroll-weight-slider', key: 'scroll_weight', valId: 'sw-v', unit: '%' },
    { id: 'alert-threshold-slider', key: 'strained_threshold', valId: 'at-v', unit: '' }
  ];

  sliders.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) {
      el.addEventListener('input', () => {
        document.getElementById(s.valId).textContent = el.value + s.unit;
      });
      el.addEventListener('change', () => {
        saveSetting(s.key, parseInt(el.value));
      });
    }
  });

  // Buttons
  const delBtn = document.getElementById('btn-delete-all');
  if (delBtn) delBtn.addEventListener('click', deleteAllData);
}


/* ─── ENTRY POINT ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await fetchUserData();
  await buildHistoryList();
  await fetchDashboardData();
  await fetchSettings();
  initSettingsListeners();
  fetchClinicalSummary();

  // Initial charts draw with default sample data for detail pages
  if (typeof initAllCharts === 'function') initAllCharts();

  const aiBtn = document.getElementById('btn-refresh-ai');
  if (aiBtn) aiBtn.addEventListener('click', generateAIPlan);

  requestAnimationFrame(() => {
    if (typeof resizeAllCharts === 'function') resizeAllCharts();
  });
});