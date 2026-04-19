// clarity/sidebar/sidebar.js
// Full production build — works with OpenRouter keys (sk-or-v1-...) AND
// direct Google Gemini keys (AIza...) with automatic detection + fallback chain.

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// ── PROVIDER LAYER ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = 'gemini-1.5-flash-latest';       // free-tier safe
const OPENROUTER_MODEL = 'google/gemini-flash-1.5';   // cheap + fast

/**
 * Detect provider from key format.
 *   AIza…            → 'gemini'
 *   sk-or-v1-…       → 'openrouter'
 *   sk-…  (OpenAI)   → 'openai'  (passthrough via OpenRouter)
 *   anything else    → 'openrouter' (OpenRouter accepts many formats)
 */
function detectProvider(key) {
  if (!key || typeof key !== 'string') return null;
  const k = key.trim();
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('sk-or-v1-')) return 'openrouter';
  if (k.startsWith('sk-')) return 'openai'; // treat as openrouter passthrough
  return 'openrouter'; // best guess
}

/**
 * Universal chat completion.
 * @param {string} key     - API key
 * @param {string} prompt  - Full user prompt (system + context already merged in)
 * @param {object} opts    - { maxTokens, temperature }
 * @returns {Promise<string>} - Response text
 */
async function callAI(key, prompt, opts = {}) {
  const { maxTokens = 1000, temperature = 0.4 } = opts;
  const provider = detectProvider(key);

  if (provider === 'gemini') {
    return callGeminiDirect(key, prompt, { maxTokens, temperature });
  }
  // OpenRouter handles both sk-or-v1- and sk- keys
  return callOpenRouter(key, prompt, { maxTokens, temperature });
}

// ── OpenRouter ────────────────────────────────────────────────────────────────
async function callOpenRouter(key, prompt, { maxTokens, temperature }) {
  const resp = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://clarity-extension.local',
      'X-Title': 'Clarity Fatigue Adapter',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await safeJson(resp);
    const msg = err?.error?.message || err?.message || `HTTP ${resp.status}`;
    // Specific, actionable errors
    if (resp.status === 401) throw new Error('Invalid OpenRouter key — check Settings.');
    if (resp.status === 402) throw new Error('OpenRouter credits exhausted. Top up at openrouter.ai.');
    if (resp.status === 429) throw new Error('Rate limited — wait a moment and try again.');
    throw new Error(`OpenRouter: ${msg}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned an empty response.');
  return text.trim();
}

// ── Gemini Direct ─────────────────────────────────────────────────────────────
async function callGeminiDirect(key, prompt, { maxTokens, temperature }) {
  const url = `${GEMINI_ENDPOINT_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        candidateCount: 1,
      },
    }),
  });

  if (!resp.ok) {
    const err = await safeJson(resp);
    const msg = err?.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 400) throw new Error(`Gemini: Bad request — ${msg}`);
    if (resp.status === 403) throw new Error('Invalid Gemini API key — check Settings.');
    if (resp.status === 429) throw new Error('Gemini quota exceeded — try again later.');
    if (resp.status === 503) throw new Error('Gemini overloaded — retrying momentarily.');
    throw new Error(`Gemini: ${msg}`);
  }

  const data = await resp.json();

  // Handle safety blocks
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const blockReason = data?.promptFeedback?.blockReason;
    throw new Error(blockReason ? `Gemini blocked: ${blockReason}` : 'Gemini returned no candidates.');
  }
  if (candidate.finishReason === 'SAFETY') throw new Error('Gemini blocked response for safety reasons.');

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response.');
  return text.trim();
}

// ── Retry wrapper (handles 503 transients) ────────────────────────────────────
async function callAIWithRetry(key, prompt, opts = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callAI(key, prompt, opts);
    } catch (err) {
      const isRetryable = err.message.includes('overloaded') ||
        err.message.includes('503') ||
        err.message.includes('Rate limited');
      if (isRetryable && attempt < retries) {
        await sleep((attempt + 1) * 1500);
        continue;
      }
      throw err;
    }
  }
}

// ── JSON extractor (used for structured AI responses) ─────────────────────────
function extractJSON(raw) {
  if (!raw) throw new Error('Empty response from AI.');
  // Strip markdown fences
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Try direct parse first
  try { return JSON.parse(cleaned); } catch { }
  // Find first {...} or [...]
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  const match = arrMatch || objMatch;
  if (match) {
    try { return JSON.parse(match[0]); } catch { }
  }
  throw new Error('AI response was not valid JSON.');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
async function safeJson(resp) { try { return await resp.json(); } catch { return {}; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// ── CONSTANTS & STATE ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const LEVEL_LABELS = ['Normal', 'Mild', 'Moderate', 'High'];
const LEVEL_COLORS = ['#6dbe8d', '#d4a84b', '#d47b4b', '#c96060'];
const RING_CIRC = 376.99; // 2π × 60

let apiKey = null;
let activeTabId = null;
let pageContext = { text: '', title: '', url: '' };
let conversation = [];
let focusModeActive = false;
let fontScale = 1;
let lineScale = 1;
let agentElementsHidden = false;

// Training
const DEFAULT_TRAINING = {
  completedSessions: 0,
  currentTargetMin: 10,
  streak: { count: 0, lastDate: null },
  history: [],
};
let trainingData = { ...DEFAULT_TRAINING };

// Session timer
let sessionStartTime = null;
let sessionTargetMs = null;
let sessionActive = false;
let sessionTimerInterval = null;

// Breathing
let breathTimeout = null;
let breathPhaseIdx = 0;
let breathRound = 0;
const BREATH_PHASES = [
  { label: 'Inhale', count: '4', expand: true, ms: 4000 },
  { label: 'Hold', count: '4', expand: true, ms: 4000 },
  { label: 'Exhale', count: '4', expand: false, ms: 4000 },
  { label: 'Hold', count: '4', expand: false, ms: 4000 },
];
const BREATH_ROUNDS = 3;

// ═══════════════════════════════════════════════════════════════════════════════
// ── DOM REFS ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

// Header / bar
const fatigueBarFill = $('fatigue-bar-fill');
const fatigueBarEl = $('fatigue-bar');
const metricsDrawer = $('metrics-drawer');
const gaugeScore = $('gauge-score');
const gaugeLabel = $('gauge-label');
const mWpm = $('m-wpm');
const mError = $('m-error');
const mJitter = $('m-jitter');
const sessionTimeLbl = $('session-time');
const adaptLevelLbl = $('adaptation-level');

// Ring / home
const ringFill = $('ring-fill');
const ringScore = $('ring-score');
const ringLabel = $('ring-label');
const homeSessionTime = $('home-session-time');
const homeLevel = $('home-level');

// Nav
const focusBtn = $('focus-btn');
const trainBtn = $('train-btn');
const chatBtn = $('chat-btn');
const settingsBtn = $('settings-btn');
const moreBtn = $('more-btn');

// Overlays
const settingsOverlay = $('settings-overlay');
const settingsClose = $('settings-close');
const moreOverlay = $('more-overlay');
const moreClose = $('more-close');

// Focus agent bar
const pageChipText = $('page-chip-text');
const agentBarIcon = $('agent-bar-icon');
const agentBarText = $('agent-bar-text');
const agentCounts = $('agent-counts');
const agentHiddenCount = $('agent-hidden-count');
const agentDimmedCount = $('agent-dimmed-count');
const agentShowAll = $('agent-show-all');
const agentRow = $('agent-row');
const agentOffNote = $('agent-off-note');

// Chat
const chatMessages = $('chat-messages');
const chatInput = $('chat-input');
const chatSend = $('chat-send');
const quickChips = $('quick-chips');

// Settings
const apiKeyInput = $('api-key-input');
const apiKeySave = $('api-key-save');
const apiKeyStatus = $('api-key-status');
const providerBadge = $('provider-badge'); // optional UI chip showing detected provider
const btnReset = $('btn-reset');
const fontDec = $('font-dec');
const fontInc = $('font-inc');
const lineDec = $('line-dec');
const lineInc = $('line-inc');

// Training view
const trainingStreak = $('training-streak');
const trainingCompleted = $('training-completed');
const trainingTarget = $('training-target');
const trainHint = $('train-hint');
const startSessionBtn = $('start-session-btn');
const breathingBtn = $('breathing-btn');

// Session view
const timerDisplay = $('timer-display');
const sessionProgress = $('session-progress');
const sessionMeta = $('session-meta');
const sessionTypeLbl = $('session-type-label');
const endSessionBtn = $('end-session-btn');

// Post-session view
const psEmoji = $('ps-emoji');
const psHeadline = $('ps-headline');
const psTime = $('ps-time');
const psProgress = $('ps-progress');
const psPct = $('ps-pct');
const psStreak = $('ps-streak');
const psNextTarget = $('ps-next-target');
const psBreakBtn = $('ps-break-btn');
const psNextBtn = $('ps-next-btn');

// Breathing view
const breathRing = $('breath-ring');
const breathPhaseEl = $('breath-phase');
const breathCount = $('breath-count');
const breathRoundsEl = $('breath-rounds');
const breathingSkip = $('breathing-skip');

// ═══════════════════════════════════════════════════════════════════════════════
// ── VIEW SWITCHING ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = $(`view-${name}`);
  if (el) el.classList.add('active');
}

document.querySelectorAll('.back-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.target));
});

trainBtn?.addEventListener('click', () => { updateTrainingUI(); switchView('training'); });
chatBtn?.addEventListener('click', () => switchView('chat'));

// ═══════════════════════════════════════════════════════════════════════════════
// ── GAUGE / FATIGUE BAR ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function updateGauge(score) {
  score = Math.max(0, Math.min(100, score));
  const level = score < 25 ? 0 : score < 50 ? 1 : score < 75 ? 2 : 3;
  const color = LEVEL_COLORS[level];
  const label = LEVEL_LABELS[level];
  const offset = RING_CIRC - (score / 100) * RING_CIRC;

  if (fatigueBarFill) { fatigueBarFill.style.width = `${score}%`; fatigueBarFill.style.background = color; }
  if (ringFill) { ringFill.style.strokeDashoffset = offset; ringFill.style.stroke = color; }
  if (ringScore) ringScore.textContent = score;
  if (ringLabel) { ringLabel.textContent = label; ringLabel.style.color = color; }
  if (gaugeScore) gaugeScore.textContent = score;
  if (gaugeLabel) { gaugeLabel.textContent = label; gaugeLabel.style.color = color; }
  if (homeLevel) homeLevel.textContent = label;
  if (adaptLevelLbl) adaptLevelLbl.textContent = ` · ${label}`;
}

function updateMetrics(m) {
  if (!m) return;
  if (mWpm) mWpm.textContent = m.wpm !== undefined ? `${m.wpm}` : '—';
  if (mError) mError.textContent = m.errorRate !== undefined ? `${Math.round(m.errorRate * 100)}%` : '—';
  if (mJitter) mJitter.textContent = m.jitter !== undefined ? `${m.jitter}px` : '—';
  if (m.sessionMinutes !== undefined) {
    const t = `Session: ${m.sessionMinutes} min`;
    if (sessionTimeLbl) sessionTimeLbl.textContent = t;
    if (homeSessionTime) homeSessionTime.textContent = t;
  }
}

fatigueBarEl?.addEventListener('click', () => metricsDrawer?.classList.toggle('open'));

// ═══════════════════════════════════════════════════════════════════════════════
// ── OVERLAYS ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

settingsBtn?.addEventListener('click', () => settingsOverlay?.classList.add('open'));
settingsClose?.addEventListener('click', () => settingsOverlay?.classList.remove('open'));
settingsOverlay?.addEventListener('click', e => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
});

moreBtn?.addEventListener('click', () => moreOverlay?.classList.add('open'));
moreClose?.addEventListener('click', () => moreOverlay?.classList.remove('open'));
moreOverlay?.addEventListener('click', e => {
  if (e.target === moreOverlay) moreOverlay.classList.remove('open');
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── FOCUS MODE ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function setFocusUI(active) {
  focusModeActive = active;
  if (!focusBtn) return;
  if (active) {
    focusBtn.textContent = '◈ Exit Focus Mode';
    focusBtn.classList.remove('off');
    if (agentRow) agentRow.style.display = 'flex';
    if (agentOffNote) agentOffNote.style.display = 'none';
  } else {
    focusBtn.innerHTML = '<span>◈</span> Enter Focus Mode';
    if (agentRow) agentRow.style.display = 'none';
    if (agentOffNote) agentOffNote.style.display = 'block';
    agentElementsHidden = false;
  }
}

focusBtn?.addEventListener('click', () => {
  const next = !focusModeActive;
  setFocusUI(next);
  chrome.storage.local.set({ focusModeActive: next });
  if (next) {
    chrome.runtime.sendMessage({ type: 'COMMAND_FOCUS_MODE' });
    if (activeTabId) {
      if (agentBarIcon) agentBarIcon.textContent = '🤖';
      if (agentBarText) agentBarText.textContent = 'Analysing distractions…';
      if (agentCounts) agentCounts.style.display = 'none';
      if (agentShowAll) agentShowAll.style.display = 'none';
      chrome.tabs.sendMessage(activeTabId, { type: 'REQUEST_DOM_SNAPSHOT' }).catch(() => { });
    }
  } else {
    chrome.runtime.sendMessage({ type: 'COMMAND_DEACTIVATE_FOCUS' });
    if (activeTabId) chrome.tabs.sendMessage(activeTabId, { type: 'RESTORE_DISTRACTIONS' }).catch(() => { });
  }
});

// Font & line controls
fontInc?.addEventListener('click', () => {
  fontScale = Math.min(fontScale + 0.1, 1.6);
  if (activeTabId) chrome.tabs.sendMessage(activeTabId, { type: 'SET_FONT_SCALE', value: fontScale }).catch(() => { });
});
fontDec?.addEventListener('click', () => {
  fontScale = Math.max(fontScale - 0.1, 0.8);
  if (activeTabId) chrome.tabs.sendMessage(activeTabId, { type: 'SET_FONT_SCALE', value: fontScale }).catch(() => { });
});
lineInc?.addEventListener('click', () => {
  lineScale = Math.min(lineScale + 0.15, 2.0);
  if (activeTabId) chrome.tabs.sendMessage(activeTabId, { type: 'SET_LINE_SCALE', value: lineScale }).catch(() => { });
});
lineDec?.addEventListener('click', () => {
  lineScale = Math.max(lineScale - 0.15, 1.0);
  if (activeTabId) chrome.tabs.sendMessage(activeTabId, { type: 'SET_LINE_SCALE', value: lineScale }).catch(() => { });
});

agentShowAll?.addEventListener('click', () => {
  if (!activeTabId) return;
  agentElementsHidden = !agentElementsHidden;
  chrome.tabs.sendMessage(activeTabId, {
    type: agentElementsHidden ? 'APPLY_DISTRACTIONS' : 'RESTORE_DISTRACTIONS',
  }).catch(() => { });
  if (agentShowAll) agentShowAll.textContent = agentElementsHidden ? 'Show all' : 'Re-hide';
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── PAGE CONTEXT ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function fetchPageContext(tabId) {
  if (!tabId) return;
  if (pageChipText) pageChipText.textContent = 'Reading page…';
  conversation = [];
  chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' }, resp => {
    if (chrome.runtime.lastError || !resp) {
      if (pageChipText) pageChipText.textContent = 'No context available';
      return;
    }
    pageContext = resp;
    if (pageChipText)
      pageChipText.textContent = `📄 ${(resp.title || resp.url || 'this page').slice(0, 55)}`;
    const w = chatMessages?.querySelector('.chat-welcome');
    if (w) w.querySelector('p').textContent =
      `I've read "${resp.title || 'this page'}". Ask me anything.`;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── AI CHAT ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function buildChatPrompt(userText) {
  if (pageContext.text) {
    return `You are a helpful AI reading assistant. Answer clearly and concisely.
Use bullet points where helpful.

PAGE TITLE: ${pageContext.title || 'Unknown'}
PAGE CONTENT (truncated to 6000 chars):
${pageContext.text.slice(0, 6000)}

USER QUESTION:
${userText}`;
  }
  return `You are a helpful assistant. Answer clearly and concisely.\n\nUSER QUESTION:\n${userText}`;
}

function renderMd(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/^[-*•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)+/g, '<ul>$&</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function addBubble(role, html) {
  chatMessages?.querySelector('.chat-welcome')?.remove();
  const d = document.createElement('div');
  d.className = `chat-bubble ${role}`;
  d.innerHTML = `<div class="bubble-avatar">${role === 'ai' ? '◎' : '·'}</div>
                 <div class="bubble-text">${html}</div>`;
  chatMessages?.appendChild(d);
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  return d;
}

function addTyping() {
  const d = document.createElement('div');
  d.className = 'chat-bubble ai';
  d.id = 'typing-indicator';
  d.innerHTML = `<div class="bubble-avatar">◎</div>
    <div class="bubble-text">
      <div class="typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>`;
  chatMessages?.appendChild(d);
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  return d;
}

async function sendMessage(text) {
  text = text.trim();
  if (!text) return;
  if (!apiKey) {
    addBubble('ai', '<span style="color:#c96060">⚠ No API key found. Open Settings (⚙) to add one.</span>');
    return;
  }
  if (chatInput) chatInput.value = '';
  if (chatInput) chatInput.style.height = 'auto';
  if (chatSend) chatSend.disabled = true;

  addBubble('user', renderMd(text));
  const typing = addTyping();

  try {
    const prompt = buildChatPrompt(text);
    const aiText = await callAIWithRetry(apiKey, prompt, { maxTokens: 800, temperature: 0.4 });
    typing.remove();
    const bubble = addBubble('ai', '');
    const btext = bubble.querySelector('.bubble-text');
    btext.style.opacity = '0';
    btext.innerHTML = renderMd(aiText);
    btext.animate(
      [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 250, easing: 'ease', fill: 'forwards' }
    );
  } catch (err) {
    typing.remove();
    addBubble('ai', `<span style="color:#c96060">⚠ ${err.message}</span>`);
  } finally {
    if (chatSend) chatSend.disabled = false;
    chatInput?.focus();
  }
}

chatSend?.addEventListener('click', () => sendMessage(chatInput?.value || ''));
chatInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput.value); }
});
chatInput?.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 90) + 'px';
});
quickChips?.querySelectorAll('.chip').forEach(c =>
  c.addEventListener('click', () => sendMessage(c.dataset.prompt))
);

// ═══════════════════════════════════════════════════════════════════════════════
// ── SETTINGS ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Show a friendly label for the detected provider.
 * Called whenever the key changes.
 */
function refreshProviderBadge(key) {
  if (!providerBadge) return;
  const p = detectProvider(key);
  const labels = {
    gemini: '✦ Gemini',
    openrouter: '⇌ OpenRouter',
    openai: '⊹ OpenAI via OR',
  };
  providerBadge.textContent = p ? (labels[p] || '? Unknown') : '';
}

apiKeyInput?.addEventListener('input', () => {
  refreshProviderBadge(apiKeyInput.value.trim());
});

apiKeySave?.addEventListener('click', () => {
  const v = apiKeyInput?.value.trim();
  if (!v) {
    showApiStatus('Enter a key first.', 'err');
    return;
  }
  // Validate format loosely
  if (!v.startsWith('AIza') && !v.startsWith('sk-')) {
    showApiStatus('⚠ Unrecognized key format. Saving anyway…', 'warn');
  }
  apiKey = v;
  chrome.storage.local.set({ openRouterApiKey: v }, () => {
    refreshProviderBadge(v);
    showApiStatus('✓ Key saved', 'ok');
  });
});

function showApiStatus(msg, cls) {
  if (!apiKeyStatus) return;
  apiKeyStatus.textContent = msg;
  apiKeyStatus.className = `api-key-status ${cls}`;
  setTimeout(() => { if (apiKeyStatus) apiKeyStatus.textContent = ''; }, 3000);
}

btnReset?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET_SESSION' });
  updateGauge(0);
  updateMetrics({ wpm: 0, errorRate: 0, jitter: 0, sessionMinutes: 0 });
  moreOverlay?.classList.remove('open');
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── TAB TRACKING ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function onActiveTabChanged(tabId) {
  if (tabId === activeTabId) return;
  activeTabId = tabId;
  pageContext = { text: '', title: '', url: '' };
  conversation = [];
  setFocusUI(false);
  setTimeout(() => fetchPageContext(tabId), 400);
}

chrome.tabs.onActivated.addListener(({ tabId }) => onActiveTabChanged(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === activeTabId && info.status === 'complete') {
    conversation = [];
    setTimeout(() => fetchPageContext(tabId), 600);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── TRAINING DATA ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function loadTraining(cb) {
  chrome.storage.local.get('training', d => {
    trainingData = d.training || { ...DEFAULT_TRAINING };
    cb && cb();
  });
}

function saveTraining() { chrome.storage.local.set({ training: trainingData }); }

function updateStreakForToday() {
  const today = new Date().toISOString().slice(0, 10);
  if (trainingData.streak.lastDate === today) return;
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  trainingData.streak.count =
    trainingData.streak.lastDate === yest ? trainingData.streak.count + 1 : 1;
  trainingData.streak.lastDate = today;
}

function completeSession(achievedMin) {
  const target = trainingData.currentTargetMin;
  const pct = achievedMin / target;
  trainingData.history.push({
    date: new Date().toISOString().slice(0, 10),
    targetMin: target,
    achievedMin,
    completed: pct >= 0.9,
  });
  trainingData.completedSessions++;
  if (pct >= 0.9 && target < 45) trainingData.currentTargetMin = Math.min(target + 1, 45);
  updateStreakForToday();
  saveTraining();
  return { target, achievedMin, pct };
}

function updateTrainingUI() {
  if (trainingStreak) trainingStreak.textContent = `${trainingData.streak.count}`;
  if (trainingCompleted) trainingCompleted.textContent = `${trainingData.completedSessions}`;
  if (trainingTarget) trainingTarget.textContent = `${trainingData.currentTargetMin}m`;
  if (trainHint) {
    trainHint.textContent = trainingData.completedSessions === 0
      ? 'Start a timed deep-work session. Each completion unlocks a longer goal.'
      : `Last target: ${trainingData.currentTargetMin} min. Complete it to level up.`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── FOCUS SESSION TIMER ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function startFocusSession() {
  const targetMin = trainingData.currentTargetMin;
  sessionStartTime = Date.now();
  sessionTargetMs = targetMin * 60 * 1000;
  sessionActive = true;
  chrome.storage.local.set({ sessionStartTime, sessionTargetMs, sessionActive: true });
  chrome.runtime.sendMessage({ type: 'START_SESSION_ALARM', durationMin: targetMin });

  if (!focusModeActive) {
    setFocusUI(true);
    chrome.storage.local.set({ focusModeActive: true });
    chrome.runtime.sendMessage({ type: 'COMMAND_FOCUS_MODE' });
  }
  if (activeTabId) {
    if (agentBarIcon) agentBarIcon.textContent = '🤖';
    if (agentBarText) agentBarText.textContent = 'Analysing distractions…';
    if (agentCounts) agentCounts.style.display = 'none';
    if (agentShowAll) agentShowAll.style.display = 'none';
    if (agentRow) agentRow.style.display = 'flex';
    if (agentOffNote) agentOffNote.style.display = 'none';
    setTimeout(() =>
      chrome.tabs.sendMessage(activeTabId, { type: 'REQUEST_DOM_SNAPSHOT' }).catch(() => { }),
      600
    );
  }

  if (sessionTypeLbl) sessionTypeLbl.textContent = 'Deep Work';
  if (sessionMeta) sessionMeta.textContent = `Target: ${targetMin} min`;
  updateTimerDisplay(0, sessionTargetMs);
  switchView('session');

  sessionTimerInterval = setInterval(() => {
    if (!sessionActive) return;
    const elapsed = Date.now() - sessionStartTime;
    if (elapsed >= sessionTargetMs) { finishSession(true); }
    else { updateTimerDisplay(elapsed, sessionTargetMs); }
  }, 1000);
}

function updateTimerDisplay(elapsed, target) {
  const rem = Math.max(0, target - elapsed);
  const mins = Math.floor(rem / 60000);
  const secs = Math.floor((rem % 60000) / 1000);
  if (timerDisplay) timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  if (sessionProgress) sessionProgress.style.width = `${Math.min(100, (elapsed / target) * 100)}%`;
}

function finishSession(completed) {
  if (!sessionActive) return;
  sessionActive = false;
  clearInterval(sessionTimerInterval);

  const achievedMin = (Date.now() - sessionStartTime) / 60000;
  const record = completeSession(achievedMin);

  chrome.storage.local.set({ sessionActive: false });
  chrome.runtime.sendMessage({ type: 'CLEAR_SESSION_ALARM' });

  setFocusUI(false);
  chrome.storage.local.set({ focusModeActive: false });
  chrome.runtime.sendMessage({ type: 'COMMAND_DEACTIVATE_FOCUS' });
  if (activeTabId) chrome.tabs.sendMessage(activeTabId, { type: 'RESTORE_DISTRACTIONS' }).catch(() => { });

  showPostSession(record, achievedMin);
}

function showPostSession({ target, pct }, achievedMin) {
  const pctRound = Math.min(100, Math.round(pct * 100));
  const mins = Math.floor(achievedMin);
  const secs = Math.floor((achievedMin - mins) * 60);
  if (psEmoji) psEmoji.textContent = pctRound >= 90 ? '🎉' : pctRound >= 60 ? '👍' : '💪';
  if (psHeadline) psHeadline.textContent = pctRound >= 90 ? 'Great work!' : pctRound >= 60 ? 'Good effort!' : 'Keep building!';
  if (psTime) psTime.textContent = `${mins} min ${String(secs).padStart(2, '0')} sec`;
  if (psProgress) psProgress.style.width = `${pctRound}%`;
  if (psPct) psPct.textContent = `${pctRound}% of goal`;
  if (psStreak) psStreak.textContent = trainingData.streak.count > 1
    ? `🔥 ${trainingData.streak.count} day streak` : '🌱 Day 1 — keep it up!';
  if (psNextTarget) psNextTarget.textContent = `Next session: ${trainingData.currentTargetMin} min`;
  switchView('postsession');
  updateTrainingUI();
}

startSessionBtn?.addEventListener('click', startFocusSession);
endSessionBtn?.addEventListener('click', () => finishSession(false));
psNextBtn?.addEventListener('click', () => switchView('training'));
psBreakBtn?.addEventListener('click', () => { startBreathing(); switchView('breathing'); });

// ═══════════════════════════════════════════════════════════════════════════════
// ── BREATHING EXERCISE ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function startBreathing() {
  breathPhaseIdx = 0;
  breathRound = 0;
  runBreathPhase();
}

function runBreathPhase() {
  if (breathRound >= BREATH_ROUNDS) { stopBreathing(); return; }
  const phase = BREATH_PHASES[breathPhaseIdx];
  if (breathPhaseEl) breathPhaseEl.textContent = phase.label;
  if (breathCount) breathCount.textContent = `${phase.count} · ${phase.count} · ${phase.count} · ${phase.count}`;
  if (breathRoundsEl) breathRoundsEl.textContent = `Round ${breathRound + 1} of ${BREATH_ROUNDS}`;
  if (breathRing) {
    if (phase.expand) breathRing.classList.add('expand');
    else breathRing.classList.remove('expand');
  }
  breathTimeout = setTimeout(() => {
    breathPhaseIdx++;
    if (breathPhaseIdx >= BREATH_PHASES.length) { breathPhaseIdx = 0; breathRound++; }
    runBreathPhase();
  }, phase.ms);
}

function stopBreathing() {
  clearTimeout(breathTimeout);
  breathTimeout = null;
  breathRing?.classList.remove('expand');
  if (breathPhaseEl) breathPhaseEl.textContent = 'Done ✓';
}

breathingBtn?.addEventListener('click', () => { startBreathing(); switchView('breathing'); });
breathingSkip?.addEventListener('click', () => { stopBreathing(); switchView('training'); });

// ═══════════════════════════════════════════════════════════════════════════════
// ── AI DISTRACTION CLASSIFICATION ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const FALLBACK_CLASSIFIER = elements =>
  elements.map((el, i) => ({
    index: i,
    classification: ['p', 'article', 'h1', 'h2', 'h3', 'main'].includes(el.tag) ? 'essential' : 'distraction',
    reason: 'fallback rule-based',
  }));

async function classifyDistractions(elements) {
  // Always attempt AI; fall back gracefully on any error or missing key
  if (!apiKey) {
    console.warn('[Clarity] No API key — using fallback classifier.');
    return FALLBACK_CLASSIFIER(elements);
  }

  const prompt = `You are a distraction classifier for a cognitive focus tool.

Classify each DOM element as exactly one of:
- "essential"      — Main content: article body, primary headings, key images
- "supplementary"  — Useful but secondary: author bio, breadcrumbs, related links
- "distraction"    — Noise: ads, social bars, newsletters, cookie banners, comment sections, recommendations

Return ONLY a JSON array. No prose, no markdown fences.
[{"index":0,"classification":"essential|supplementary|distraction","reason":"1-3 words"}]

Elements to classify:
${JSON.stringify(elements, null, 1)}`;

  try {
    const raw = await callAIWithRetry(apiKey, prompt, { maxTokens: 1200, temperature: 0.1 });
    const parsed = extractJSON(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected array from AI.');
    // Validate each item has required fields
    return parsed.map((item, i) => ({
      index: item.index ?? i,
      classification: ['essential', 'supplementary', 'distraction'].includes(item.classification)
        ? item.classification : 'distraction',
      reason: item.reason ?? '',
    }));
  } catch (err) {
    console.warn('[Clarity] AI classifier failed, using fallback:', err.message);
    return FALLBACK_CLASSIFIER(elements);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── MESSAGE LISTENER ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener(msg => {
  switch (msg.type) {

    case 'CLARITY_METRICS':
      updateGauge(msg.payload.fatigueScore);
      updateMetrics(msg.payload.metrics);
      break;

    case 'DOM_SNAPSHOT':
      if (!focusModeActive || !activeTabId) break;
      (async () => {
        const result = await classifyDistractions(msg.elements);
        const hidden = result.filter(e => e.classification === 'distraction').length;
        const dimmed = result.filter(e => e.classification === 'supplementary').length;

        if (agentBarIcon) agentBarIcon.textContent = '✓';
        if (agentBarText) agentBarText.textContent = 'Page cleaned up';
        if (agentCounts) agentCounts.style.display = 'flex';
        if (agentHiddenCount) agentHiddenCount.textContent = hidden;
        if (agentDimmedCount) agentDimmedCount.textContent = dimmed;
        if (agentShowAll) {
          agentShowAll.style.display = 'inline-block';
          agentShowAll.textContent = 'Show all';
        }
        agentElementsHidden = true;

        chrome.tabs.sendMessage(activeTabId, {
          type: 'FOCUS_AGENT_RESULT',
          classifications: result,
        }).catch(() => { });
      })();
      break;

    case 'SESSION_COMPLETE':
      if (sessionActive) finishSession(true);
      break;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── INIT ──────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEYS = [
  'openRouterApiKey', 'lastMetrics', 'fatigueScore', 'focusModeActive',
  'sessionStartTime', 'sessionTargetMs', 'sessionActive',
];

chrome.storage.local.get(STORAGE_KEYS, data => {
  // ── API key ────────────────────────────────────────────────────────────────
  if (data.openRouterApiKey) {
    apiKey = data.openRouterApiKey;
    if (apiKeyInput) apiKeyInput.value = apiKey;
    refreshProviderBadge(apiKey);
  }
  // No default key baked in — user must supply their own.

  // ── Metrics ────────────────────────────────────────────────────────────────
  updateGauge(data.fatigueScore || 0);
  updateMetrics(data.lastMetrics || {});
  setFocusUI(data.focusModeActive || false);

  // ── Resume interrupted session ─────────────────────────────────────────────
  if (data.sessionActive && data.sessionStartTime && data.sessionTargetMs) {
    sessionStartTime = data.sessionStartTime;
    sessionTargetMs = data.sessionTargetMs;
    sessionActive = true;
    const elapsed = Date.now() - sessionStartTime;
    if (elapsed < sessionTargetMs) {
      updateTimerDisplay(elapsed, sessionTargetMs);
      switchView('session');
      sessionTimerInterval = setInterval(() => {
        if (!sessionActive) return;
        const e = Date.now() - sessionStartTime;
        if (e >= sessionTargetMs) finishSession(true);
        else updateTimerDisplay(e, sessionTargetMs);
      }, 1000);
    } else {
      finishSession(true);
    }
  }

  // ── Training data ──────────────────────────────────────────────────────────
  loadTraining(updateTrainingUI);
});

// Get current active tab
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  if (tabs[0]) onActiveTabChanged(tabs[0].id);
});