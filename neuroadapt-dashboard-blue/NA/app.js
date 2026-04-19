/* ============================================================
   app.js — NeuroAdapt
   Navigation logic + UI interactions (history list, toggles).
   This is the "brain" of the frontend.
   ============================================================ */


/* ─── NAVIGATION ─────────────────────────────────────────
   nav(id) is called by every sidebar button (onclick="nav('dashboard')")
   It hides all pages, then shows only the one you clicked.
   It also marks the right sidebar button as "active".       */
function nav(id) {
  /* Hide every page */
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  /* Remove "active" highlight from every nav button */
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  /* Show the target page */
  document.getElementById('page-' + id).classList.add('active');

  /* Highlight the matching sidebar button
     map tells us which button index belongs to which page id */
  const map = { dashboard: 0, scoredetail: 0, history: 1, help: 2, settings: 3 };
  if (map[id] !== undefined) {
    document.querySelectorAll('.nav-btn')[map[id]].classList.add('active');
  }

  /* Scroll the main content area back to top */
  document.querySelector('.main').scrollTo(0, 0);

  /* Charts on previously hidden pages need a resize (see a_charts.js) */
  requestAnimationFrame(() => {
    if (typeof resizeAllCharts === 'function') resizeAllCharts();
  });
}


/* ─── SESSION HISTORY LIST ───────────────────────────────
   Builds the list of past sessions shown on the History page.
   Each row is created dynamically from the sessions array.
   In a real app with a backend, you would fetch this data
   from the API instead of using this hardcoded array.        */
const sessions = [
  { date: 'Today · 2:14 PM',           score: 62, status: 'Fragile',  dur: '42 min', wpm: 34, err: 18 },
  { date: 'Yesterday · 10:22 AM',       score: 55, status: 'Fragile',  dur: '1h 8m',  wpm: 41, err: 12 },
  { date: 'Yesterday · 3:05 PM',        score: 48, status: 'Fragile',  dur: '38 min', wpm: 46, err: 9  },
  { date: 'Sat 18 Apr · 9:00 AM',       score: 32, status: 'Healthy',  dur: '52 min', wpm: 56, err: 5  },
  { date: 'Fri 17 Apr · 2:30 PM',       score: 71, status: 'Strained', dur: '1h 22m', wpm: 28, err: 22 },
  { date: 'Fri 17 Apr · 9:15 AM',       score: 44, status: 'Fragile',  dur: '45 min', wpm: 49, err: 8  },
  { date: 'Thu 16 Apr · 11:00 AM',      score: 38, status: 'Healthy',  dur: '58 min', wpm: 54, err: 6  },
];

function buildHistoryList() {
  const histEl = document.getElementById('histList');
  if (!histEl) return; /* Safety check — stop if element not found */

  sessions.forEach(s => {
    /* Pick color and badge class based on score thresholds */
    const col  = s.score >= 70 ? 'var(--danger)' : s.score >= 40 ? 'var(--warn)' : 'var(--ok)';
    const bcls = s.score >= 70 ? 'badge-danger'  : s.score >= 40 ? 'badge-warn'  : 'badge-ok';

    const div = document.createElement('div');
    div.className = 'hist-row';

    /* innerHTML builds the full row structure for one session */
    div.innerHTML = `
      <div class="hist-dot" style="background:${col}"></div>
      <div class="hist-date">${s.date}</div>
      <div class="hist-score" style="color:${col}">${s.score}</div>
      <div class="hist-bars">
        <div class="hbar-row">
          <span class="hbar-l">WPM</span>
          <div class="hbar-t">
            <div class="hbar-f" style="width:${Math.round(s.wpm / 60 * 100)}%;background:var(--teal)"></div>
          </div>
          <span class="hbar-v">${s.wpm}</span>
        </div>
        <div class="hbar-row">
          <span class="hbar-l">Err</span>
          <div class="hbar-t">
            <div class="hbar-f" style="width:${s.err}%;background:${col}"></div>
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


/* ─── AI RECOMMENDATIONS ───────────────────────────────────
   Fetches weekly fatigue data from storage, sends it to the Ollama
   backend, and renders the personalized improvement steps.   */
async function generateAIPlan() {
  const container = document.getElementById('ai-recs-container');
  const btn = document.getElementById('btn-refresh-ai');
  if (!container || !btn) return;

  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Loading...`;
  btn.style.opacity = '0.7';
  btn.disabled = true;

  try {
    // 1. Get weekly data from extension storage
    const storageData = await new Promise(resolve => {
      chrome.storage.local.get(['weeklyFatigue', 'userId'], resolve);
    });
    
    const weekly = storageData.weeklyFatigue || {};
    let dataStr = "No data recorded yet.";
    
    if (Object.keys(weekly).length > 0) {
      const summary = [];
      for (const date in weekly) {
        const d = weekly[date];
        const avg = Math.round(d.scores.reduce((a, b) => a + b, 0) / d.count);
        summary.push(`${date}: Average fatigue score = ${avg}/100`);
      }
      dataStr = summary.join('\n');
    }

    // 2. Call backend
    const resp = await fetch('http://127.0.0.1:8000/api/ollama/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': storageData.userId || 'dashboard-user'
      },
      body: JSON.stringify({ 
        mode: 'recommend',
        user_message: dataStr
      }),
    });

    if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
    const result = await resp.json();
    
    // 3. Parse JSON response
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
      else throw new Error('AI did not return valid JSON');
    }

    if (!Array.isArray(steps)) throw new Error('Expected array from AI.');

    // 4. Render
    container.innerHTML = '';
    steps.forEach((step, i) => {
      const pColor = step.priority === 'high' ? 'var(--danger)' : step.priority === 'medium' ? 'var(--warn)' : 'var(--teal)';
      const pBg = step.priority === 'high' ? 'var(--danger-dim)' : step.priority === 'medium' ? 'var(--warn-dim)' : 'rgba(58,170,212,0.1)';
      
      container.innerHTML += `
        <div style="background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:12px 16px; display:flex; gap:14px; align-items:flex-start;">
          <div style="background:${pBg}; color:${pColor}; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0;">${i+1}</div>
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
    container.innerHTML = `<div style="color:var(--danger); padding:10px; background:var(--danger-dim); border-radius:6px; font-size:13px;">Failed to generate plan. Ensure your backend is running. (${err.message})</div>`;
  } finally {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 102.6-6.4L2 8"/></svg> Refresh Plan`;
    btn.style.opacity = '1';
    btn.disabled = false;
  }
}

/* ─── ENTRY POINT ────────────────────────────────────────
   DOMContentLoaded fires when all HTML elements are ready.
   We wait for this before touching the DOM or drawing charts,
   because the canvas elements must exist before Chart.js runs. */
document.addEventListener('DOMContentLoaded', () => {
  buildHistoryList(); /* Build the session list on the History page */
  initAllCharts();    /* Draw all charts (a_charts.js) */
  
  const aiBtn = document.getElementById('btn-refresh-ai');
  if (aiBtn) aiBtn.addEventListener('click', generateAIPlan);

  requestAnimationFrame(() => {
    if (typeof resizeAllCharts === 'function') resizeAllCharts();
  });
});