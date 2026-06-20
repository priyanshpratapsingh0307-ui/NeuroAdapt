/* ============================================================
   a_charts.js — NeuroAdapt
   All Chart.js chart setup and initialization.
   Runs after the page loads. Each function builds one chart.
   ============================================================ */

/* ─── CHART GLOBAL DEFAULTS ─────────────────────────────
   These settings apply to EVERY chart on the page.
   We set the font, color, and grid style once here
   instead of repeating it in every chart config.        */
if (typeof Chart === 'undefined') {
  console.error('NeuroAdapt: Chart.js library not found. Ensure it is loaded before a_charts.js');
}

if (typeof Chart !== 'undefined') {
  // Global defaults for Chart.js
  Chart.defaults.color       = '#475569';
  Chart.defaults.font.family = "'DM Mono', monospace";
  Chart.defaults.font.size   = 11;
}

const gridColor = 'rgba(200, 232, 245, 0.05)';

/* Shared options reused by all charts */
const baseOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0F121B',
      borderColor: 'rgba(200, 232, 245, 0.1)',
      borderWidth: 1,
      titleColor: '#EAF6FC',
      bodyColor: '#94A3B8',
      padding: 10,
      cornerRadius: 8
    }
  },
  scales: {
    x: { grid: { color: gridColor }, ticks: { color: '#475569' } },
    y: { grid: { color: gridColor }, ticks: { color: '#475569' } }
  }
};

/* 30-point time label (every 5 minutes) */
const L30 = Array.from({ length: 30 }, (_, i) => i % 5 === 0 ? i + 'm' : '');


/* ─── DASHBOARD: SCORE TREND CHART ──────────────────────
   Line chart on the Dashboard showing the cognitive load
   score rising over time. */
function initTrendChart(trendData = null) {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('trendChart');
  if (!el) return;
  
  // Destroy existing chart if it exists to allow re-initialization with new data
  const existing = Chart.getChart(el);
  if (existing) existing.destroy();

  const labels = trendData ? trendData.map(d => {
    const date = new Date(d.timestamp);
    return date.getHours() + ":" + String(date.getMinutes()).padStart(2, '0');
  }) : L30;

  const scores = trendData ? trendData.map(d => d.score) : [22,25,28,30,35,38,42,40,44,48,50,52,55,54,58,60,59,61,63,62,65,64,62,61,60,62,63,62,61,62];

  new Chart(el, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: scores,
        borderColor: '#3AAAD4',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(58, 170, 212, 0.08)',
        tension: .4,
        pointRadius: trendData ? 3 : 0
      }]
    },
    options: { ...baseOpts }
  });
}


/* ─── SCORE DETAIL: TYPING RHYTHM CHART ───────────────── */
function initTypingChart(wpmData = null) {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('typingChart');
  if (!el) return;

  const existing = Chart.getChart(el);
  if (existing) existing.destroy();

  const labels = wpmData ? Array.from({length: wpmData.length}, (_, i) => i + 'm') : L30;
  const data = wpmData ? wpmData : [180,185,190,195,200,210,220,215,230,240,260,270,280,275,300,320,315,330,340,345,360,355,340,330,325,340,350,345,340,345];

  new Chart(el, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Gap ms',
        data: data,
        borderColor: '#F87171',
        borderWidth: 2,
        fill: false,
        tension: .4,
        pointRadius: wpmData ? 2 : 0
      }]
    },
    options: { ...baseOpts }
  });
}


/* ─── SCORE DETAIL: ERROR RATE BAR CHART ──────────────── */
function initErrorChart(errData = null) {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('errorChart');
  if (!el) return;

  const existing = Chart.getChart(el);
  if (existing) existing.destroy();

  const labels = errData ? Array.from({length: errData.length}, (_, i) => i * 3 + 'm') : Array.from({ length: 12 }, (_, i) => i * 3 + 'm');
  const data = errData ? errData : [3,4,4,5,6,7,8,10,12,14,16,18];

  new Chart(el, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: (context) => {
          const raw = context.parsed?.y ?? context.dataset.data[context.dataIndex];
          const v = typeof raw === 'number' ? raw : Number(raw);
          if (Number.isNaN(v)) return '#34D399';
          return v >= 12 ? '#F87171' : v >= 7 ? '#FBBF24' : '#34D399';
        },
        borderRadius: 4
      }]
    },
    options: { ...baseOpts }
  });
}


/* ─── SCORE DETAIL: SCROLL REVERSAL CHART ─────────────── */
function initScrollChart(scrollData = null) {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('scrollChart');
  if (!el) return;

  const existing = Chart.getChart(el);
  if (existing) existing.destroy();

  const labels = scrollData ? Array.from({length: scrollData.length}, (_, i) => i * 3 + 'm') : Array.from({ length: 12 }, (_, i) => i * 3 + 'm');
  const data = scrollData ? scrollData : [2,2,3,3,4,5,6,7,9,11,13,14];

  new Chart(el, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        borderColor: '#818CF8',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(129, 140, 248, 0.08)',
        tension: .4,
        pointRadius: scrollData ? 2 : 0
      }]
    },
    options: { ...baseOpts }
  });
}


/* ─── SCORE DETAIL: 7-SESSION HISTORY CHART ───────────── */
function initHistDetailChart(historyData = null) {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('histDetailChart');
  if (!el) return;

  const existing = Chart.getChart(el);
  if (existing) existing.destroy();

  const labels = historyData ? historyData.map(h => h.date) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const scores = historyData ? historyData.map(h => h.score) : [72, 68, 65, 58, 61, 55, 62];

  new Chart(el, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: scores,
        borderColor: '#3AAAD4',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(58, 170, 212, 0.08)',
        tension: .4,
        pointBackgroundColor: '#3AAAD4',
        pointRadius: 4,
        pointBorderColor: '#080A10',
        pointBorderWidth: 2
      }]
    },
    options: { ...baseOpts }
  });
}


/* ─── HISTORY PAGE: WEEKLY PATTERN CHART ──────────────── */
function initPatternChart(sessionsArray = []) {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('patternChart');
  if (!el) return;
  
  const existing = Chart.getChart(el);
  if (existing) existing.destroy();

  let morn = [0,0,0,0,0,0,0], aft = [0,0,0,0,0,0,0], eve = [0,0,0,0,0,0,0];
  let mornC = [0,0,0,0,0,0,0], aftC = [0,0,0,0,0,0,0], eveC = [0,0,0,0,0,0,0];
  
  sessionsArray.forEach(s => {
    // Parse the date (which was formatted locally) to get day and hour
    const d = new Date(s.date);
    let day = d.getDay() - 1; // 0=Mon, 6=Sun
    if (day < 0) day = 6;
    const h = d.getHours();
    
    if (h < 12) { morn[day] += s.score; mornC[day]++; }
    else if (h < 17) { aft[day] += s.score; aftC[day]++; }
    else { eve[day] += s.score; eveC[day]++; }
  });
  
  for(let i=0; i<7; i++) {
    if(mornC[i]) morn[i] = Math.round(morn[i]/mornC[i]);
    if(aftC[i]) aft[i] = Math.round(aft[i]/aftC[i]);
    if(eveC[i]) eve[i] = Math.round(eve[i]/eveC[i]);
  }
  
  // if all empty, show default dummy
  if (sessionsArray.length === 0) {
    morn = [45,50,48,42,55,38,40];
    aft = [62,68,72,60,75,44,62];
    eve = [38,42,55,35,60,30,48];
  }

  new Chart(el, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        { label: 'Morning',   data: morn, backgroundColor: 'rgba(58, 170, 212, 0.6)',  borderRadius: 3 },
        { label: 'Afternoon', data: aft, backgroundColor: 'rgba(251, 191, 36, 0.6)',  borderRadius: 3 },
        { label: 'Evening',   data: eve, backgroundColor: 'rgba(129, 140, 248, 0.6)', borderRadius: 3 }
      ]
    },
    options: {
      ...baseOpts,
      plugins: {
        ...baseOpts.plugins,
        legend: {
          display: true,
          labels: { color: '#94A3B8', font: { size: 11 }, boxWidth: 10, padding: 12 }
        }
      }
    }
  });
}


/* ─── INIT ALL CHARTS ──────────────────────────────────── */
function initAllCharts(data = {}) {
  initTrendChart(data.trend);
  initTypingChart();
  initErrorChart();
  initScrollChart();
  initHistDetailChart(data.history);
  initPatternChart();
}


/* ─── RESIZE ALL CHARTS ───────────────────────────────────
   Canvases on inactive pages (display:none) measure as 0×0
   on first draw. After a page becomes visible, Chart.js must
   resize to the real container width. Call this after nav(). */
function resizeAllCharts() {
  if (typeof Chart === 'undefined') return;
  const ids = [
    'trendChart',
    'typingChart',
    'errorChart',
    'scrollChart',
    'histDetailChart',
    'patternChart'
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const chart = Chart.getChart(el);
    if (chart) chart.resize();
  });
}