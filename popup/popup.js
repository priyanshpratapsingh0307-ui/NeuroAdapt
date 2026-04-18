// clarity/popup/popup.js

const LEVEL_LABELS = ['Normal', 'Mild', 'Moderate', 'High'];
const LEVEL_COLORS  = ['#4ade80', '#facc15', '#fb923c', '#f87171'];
const LEVEL_STATUS  = ['Monitoring', 'Mild Load', 'Adapting', 'High Load'];
const LEVEL_CLASSES = ['', 'warn', 'alert', 'high'];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const gaugeFill    = document.getElementById('gauge-fill');
const gaugeNeedle  = document.getElementById('gauge-needle');
const gaugeScore   = document.getElementById('gauge-score');
const gaugeLabel   = document.getElementById('gauge-label');
const statusPill   = document.getElementById('status-pill');
const mWpm         = document.getElementById('m-wpm');
const mError       = document.getElementById('m-error');
const mScroll      = document.getElementById('m-scroll');
const mJitter      = document.getElementById('m-jitter');
const btnFocus     = document.getElementById('btn-focus');
const focusToggle  = document.getElementById('focus-toggle');
const btnSummarize = document.getElementById('btn-summarize');
const btnReset     = document.getElementById('btn-reset');
const sessionTime  = document.getElementById('session-time');
const adaptLevel   = document.getElementById('adaptation-level');

let focusModeActive = false;

// ── Gauge update ──────────────────────────────────────────────────────────────
function updateGauge(score) {
  score = Math.max(0, Math.min(100, score));
  const level = score < 25 ? 0 : score < 50 ? 1 : score < 75 ? 2 : 3;
  const color  = LEVEL_COLORS[level];

  // Arc: total arc length ≈ 251.2 (half circle π*r where r=80)
  const arcLen   = 251.2;
  const fillLen  = (score / 100) * arcLen;
  const offset   = arcLen - fillLen;
  gaugeFill.style.strokeDashoffset = offset;
  gaugeFill.style.stroke = color;

  // Needle: rotate from -90deg (0) to +90deg (100)
  const angle = -90 + (score / 100) * 180;
  gaugeNeedle.style.transform = `rotate(${angle}deg)`;

  gaugeScore.textContent = score;
  gaugeLabel.textContent = LEVEL_LABELS[level];
  gaugeLabel.style.color = color;

  // Status pill
  statusPill.textContent = LEVEL_STATUS[level];
  statusPill.className = `status-pill ${LEVEL_CLASSES[level]}`;
  adaptLevel.textContent = `Level: ${LEVEL_LABELS[level]}`;
}

// ── Metrics update ────────────────────────────────────────────────────────────
function updateMetrics(metrics) {
  if (!metrics) return;
  mWpm.textContent   = metrics.wpm   !== undefined ? `${metrics.wpm}` : '—';
  mError.textContent = metrics.errorRate !== undefined ? `${Math.round(metrics.errorRate * 100)}%` : '—';
  mScroll.textContent = metrics.scrollIrregularity !== undefined ? `${metrics.scrollIrregularity}` : '—';
  mJitter.textContent = metrics.jitter !== undefined ? `${metrics.jitter}px` : '—';

  if (metrics.sessionMinutes !== undefined) {
    sessionTime.textContent = `Session: ${metrics.sessionMinutes} min`;
  }
}

// ── Focus mode toggle ─────────────────────────────────────────────────────────
function setFocusUI(active) {
  focusModeActive = active;
  if (active) {
    btnFocus.classList.add('active');
  } else {
    btnFocus.classList.remove('active');
  }
}

btnFocus.addEventListener('click', () => {
  const next = !focusModeActive;
  setFocusUI(next);
  chrome.runtime.sendMessage({
    type: next ? 'COMMAND_FOCUS_MODE' : 'COMMAND_DEACTIVATE_FOCUS'
  });
  chrome.storage.local.set({ focusModeActive: next });
});

// ── Summarize ─────────────────────────────────────────────────────────────────
btnSummarize.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_SUMMARY' }).catch(() => {});
    window.close();
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────
btnReset.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET_SESSION' });
  updateGauge(0);
  updateMetrics({ wpm: 0, errorRate: 0, scrollIrregularity: 0, jitter: 0, sessionMinutes: 0 });
  sessionTime.textContent = 'Session: 0 min';
});

// ── Load initial state ────────────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (data) => {
  if (!data) return;
  updateGauge(data.fatigueScore || 0);
  updateMetrics(data.lastMetrics || {});
  setFocusUI(data.focusModeActive || false);
});

// ── Live updates while popup is open ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CLARITY_METRICS') {
    updateGauge(msg.payload.fatigueScore);
    updateMetrics(msg.payload.metrics);
  }
});
