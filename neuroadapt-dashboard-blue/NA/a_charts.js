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
   score rising over the last 30 minutes of the session.  */
function initTrendChart() {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('trendChart');
  if (!el) return;
  new Chart(el, {
    type: 'line',
    data: {
      labels: L30,
      datasets: [{
        data: [22,25,28,30,35,38,42,40,44,48,50,52,55,54,58,60,59,61,63,62,65,64,62,61,60,62,63,62,61,62],
        borderColor: '#3AAAD4',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(58, 170, 212, 0.08)',
        tension: .4,
        pointRadius: 0
      }]
    },
    options: { ...baseOpts }
  });
}


/* ─── SCORE DETAIL: TYPING RHYTHM CHART ─────────────────
   Shows how keystroke gap (ms) increases over time —
   a rising line means the user is slowing down (fatigue). */
function initTypingChart() {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('typingChart');
  if (!el) return;
  new Chart(el, {
    type: 'line',
    data: {
      labels: L30,
      datasets: [{
        label: 'Gap ms',
        data: [180,185,190,195,200,210,220,215,230,240,260,270,280,275,300,320,315,330,340,345,360,355,340,330,325,340,350,345,340,345],
        borderColor: '#F87171',
        borderWidth: 2,
        fill: false,
        tension: .4,
        pointRadius: 0
      }]
    },
    options: { ...baseOpts }
  });
}


/* ─── SCORE DETAIL: ERROR RATE BAR CHART ────────────────
   Bar chart where each bar represents a 3-minute window.
   Color changes automatically: green → yellow → red
   based on how high the error rate is.                   */
function initErrorChart() {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('errorChart');
  if (!el) return;
  new Chart(el, {
    type: 'bar',
    data: {
      labels: Array.from({ length: 12 }, (_, i) => i * 3 + 'm'),
      datasets: [{
        data: [3,4,4,5,6,7,8,10,12,14,16,18],
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


/* ─── SCORE DETAIL: SCROLL REVERSAL CHART ───────────────
   Lavender line chart showing how many times the user
   scrolled backward per minute — indicates re-reading.  */
function initScrollChart() {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('scrollChart');
  if (!el) return;
  new Chart(el, {
    type: 'line',
    data: {
      labels: Array.from({ length: 12 }, (_, i) => i * 3 + 'm'),
      datasets: [{
        data: [2,2,3,3,4,5,6,7,9,11,13,14],
        borderColor: '#818CF8',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(129, 140, 248, 0.08)',
        tension: .4,
        pointRadius: 0
      }]
    },
    options: { ...baseOpts }
  });
}


/* ─── SCORE DETAIL: 7-SESSION HISTORY CHART ─────────────
   Line chart showing this week's daily FragileScore.
   Dots on data points make individual sessions readable. */
function initHistDetailChart() {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('histDetailChart');
  if (!el) return;
  new Chart(el, {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        data: [72, 68, 65, 58, 61, 55, 62],
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


/* ─── HISTORY PAGE: WEEKLY PATTERN CHART ────────────────
   Grouped bar chart showing Morning / Afternoon / Evening
   scores for each day. Helps spot time-of-day patterns.  */
function initPatternChart() {
  if (typeof Chart === 'undefined') return;
  const el = document.getElementById('patternChart');
  if (!el) return;
  new Chart(el, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        { label: 'Morning',   data: [45,50,48,42,55,38,40], backgroundColor: 'rgba(58, 170, 212, 0.6)',  borderRadius: 3 },
        { label: 'Afternoon', data: [62,68,72,60,75,44,62], backgroundColor: 'rgba(251, 191, 36, 0.6)',  borderRadius: 3 },
        { label: 'Evening',   data: [38,42,55,35,60,30,48], backgroundColor: 'rgba(129, 140, 248, 0.6)', borderRadius: 3 }
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


/* ─── INIT ALL CHARTS ────────────────────────────────────
   Called once from app.js after the DOM is ready.
   All chart canvases must exist in the HTML before this runs. */
function initAllCharts() {
  initTrendChart();
  initTypingChart();
  initErrorChart();
  initScrollChart();
  initHistDetailChart();
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