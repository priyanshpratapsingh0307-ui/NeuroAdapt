// clarity/sidebar/sidebar.js — Light Focus Assistant Redesign
'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// ── BACKEND / STATE ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

let BACKEND_URL = 'http://127.0.0.1:8000';
let ollamaModel = 'mistral';
let activeTabId = null;
let pageContext = { text: '', title: '', url: '' };
let focusModeActive = false;

// ═══════════════════════════════════════════════════════════════════════════════
// ── DOM REFS ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

// Ring & Breakdown
const ringTrigger = $('ring-trigger');
const breakdownDrawer = $('breakdown-drawer');
const interactionHint = $('interaction-hint');
const ringScore = $('ring-score');
const ringFill = $('ring-fill');
const gaugeLabel = $('gauge-label');

// Metrics Values
const mWpm = $('m-wpm');
const mError = $('m-error');
const mScrollValue = $('m-scroll');
const mJitter = $('m-jitter');
const mRage = $('m-rage');

// Metrics Bars
const barWpm = $('bar-wpm');
const barError = $('bar-error');
const barScroll = $('bar-scroll');
const barJitter = $('bar-jitter');
const barRage = $('bar-rage');

// Actions
const focusToggle = $('focus-toggle');
const focusStatus = $('focus-status');
const summarizeBtn = $('summarize-btn');
const btnReset = $('btn-reset');
const settingsBtn = $('settings-btn');
const settingsOverlay = $('settings-overlay');
const settingsClose = $('settings-close');

// ═══════════════════════════════════════════════════════════════════════════════
// ── CORE LOGIC ────────────────────────────────══════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toggle Breakdown Drawer
 */
ringTrigger?.addEventListener('click', () => {
  const isOpen = breakdownDrawer?.classList.contains('open');
  if (isOpen) {
    breakdownDrawer.classList.remove('open');
    if (interactionHint) interactionHint.textContent = 'Tap ring to see breakdown';
  } else {
    breakdownDrawer.classList.add('open');
    if (interactionHint) interactionHint.textContent = 'Tap ring to collapse';
  }
});

/**
 * Update Fatigue Ring & Score
 */
function updateGauge(score) {
  score = Math.max(0, Math.min(100, score));
  const circ = 439.8; // 2π × 70
  const offset = circ - (score / 100) * circ;

  const labels = ['Calm & Focused', 'Mild Stress', 'Increasing Fatigue', 'Critical Load'];
  const colors = ['#3AAAD4', '#FACC15', '#FB923C', '#FB7185'];
  const level = score < 25 ? 0 : score < 50 ? 1 : score < 75 ? 2 : 3;

  if (ringScore) ringScore.textContent = score;
  if (ringFill) {
    ringFill.style.strokeDashoffset = offset;
    ringFill.style.stroke = colors[level];
  }
  if (gaugeLabel) {
    gaugeLabel.textContent = labels[level];
    gaugeLabel.style.background = level === 0 ? 'var(--accent-light)' : colors[level] + '20';
    gaugeLabel.style.color = level === 0 ? '#165E8F' : colors[level];
  }
}

/**
 * Update Breakdown Metrics
 */
function updateMetrics(m) {
  if (!m) return;
  
  // Update Values
  if (mWpm) mWpm.textContent = m.wpm || '0';
  if (mError) mError.textContent = Math.round((m.errorRate || 0) * 100);
  if (mScrollValue) mScrollValue.textContent = (m.scrollRate || 0).toFixed(1);
  if (mJitter) mJitter.textContent = m.jitter || '0';
  if (mRage) mRage.textContent = m.rageClicks || '0';

  // Update Bars (Simple scaling for demo)
  if (barWpm) barWpm.style.width = Math.min(100, (m.wpm || 0) / 1.2) + '%';
  if (barError) barError.style.width = Math.min(100, (m.errorRate || 0) * 500) + '%';
  if (barScroll) barScroll.style.width = Math.min(100, (m.scrollRate || 0) * 20) + '%';
  if (barJitter) barJitter.style.width = Math.min(100, (m.jitter || 0) / 5) + '%';
  if (barRage) barRage.style.width = Math.min(100, (m.rageClicks || 0) * 25) + '%';
}

/**
 * Focus Mode Toggle
 */
focusToggle?.addEventListener('change', () => {
  const active = focusToggle.checked;
  focusModeActive = active;
  if (focusStatus) focusStatus.textContent = active ? 'On — AI cleaning page' : 'Off — distractions allowed';
  
  chrome.storage.local.set({ focusModeActive: active });
  if (active) {
    chrome.runtime.sendMessage({ type: 'COMMAND_FOCUS_MODE' });
    if (activeTabId) chrome.tabs.sendMessage(activeTabId, { type: 'REQUEST_DOM_SNAPSHOT' }).catch(() => { });
  } else {
    chrome.runtime.sendMessage({ type: 'COMMAND_DEACTIVATE_FOCUS' });
    if (activeTabId) chrome.tabs.sendMessage(activeTabId, { type: 'RESTORE_DISTRACTIONS' }).catch(() => { });
  }
});

/**
 * Reset Session
 */
btnReset?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET_SESSION' });
  updateGauge(0);
  updateMetrics({ wpm: 0, errorRate: 0, jitter: 0, scrollRate: 0, rageClicks: 0 });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── BACKEND CALLS ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

async function callBackend({ mode, pageTitle = '', pageText = '', userMessage }) {
  const userId = await getOrCreateUserId();
  try {
    const resp = await fetch(`${BACKEND_URL}/api/ollama/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ mode, page_title: pageTitle, page_text: pageText, user_message: userMessage }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.reply;
  } catch (err) {
    console.error('Backend error:', err);
    throw err;
  }
}

async function getOrCreateUserId() {
  return new Promise(resolve => {
    chrome.storage.local.get('userId', d => {
      if (d.userId) return resolve(d.userId);
      const id = crypto.randomUUID();
      chrome.storage.local.set({ userId: id }, () => resolve(id));
    });
  });
}

async function runSummarize() {
  if (summarizeBtn.classList.contains('loading')) return;
  summarizeBtn.classList.add('loading');
  const originalText = summarizeBtn.querySelector('.action-desc').textContent;
  summarizeBtn.querySelector('.action-desc').textContent = 'AI is reading...';

  try {
    const summary = await callBackend({
      mode: 'summarise',
      pageTitle: pageContext.title,
      pageText: pageContext.text.slice(0, 6000),
      userMessage: 'summarise'
    });
    showSummaryOverlay(summary);
  } catch (err) {
    console.error('Auto-summarize failed:', err);
  } finally {
    summarizeBtn.classList.remove('loading');
    summarizeBtn.querySelector('.action-desc').textContent = originalText;
  }
}

/**
 * Summarize Button
 */
summarizeBtn?.addEventListener('click', runSummarize);

function showSummaryOverlay(text) {
  const overlay = $('clarity-summary-overlay');
  const content = $('summary-content');
  if (overlay && content) {
    content.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    overlay.style.display = 'flex';
  }
}

$('close-summary')?.addEventListener('click', () => {
  $('clarity-summary-overlay').style.display = 'none';
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── TAB / MESSAGE LISTENERS ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function fetchPageContext(tabId) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' }, resp => {
    if (resp) pageContext = resp;
  });
}

function onActiveTabChanged(tabId) {
  if (tabId === activeTabId) return;
  activeTabId = tabId;
  fetchPageContext(tabId);
}

chrome.tabs.onActivated.addListener(({ tabId }) => onActiveTabChanged(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === activeTabId && info.status === 'complete') fetchPageContext(tabId);
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'CLARITY_METRICS') {
    updateGauge(msg.payload.fatigueScore);
    updateMetrics(msg.payload.metrics);
    chrome.storage.local.set({ 
      fatigueScore: msg.payload.fatigueScore,
      lastMetrics: msg.payload.metrics 
    });
  }

  if (msg.type === 'AUTO_SUMMARIZE_TRIGGER') {
    runSummarize();
  }

  // ── AI DISTRACTION CLASSIFICATION PIPELINE ──────────────────────────────────
  if (msg.type === 'DOM_SNAPSHOT' && focusModeActive) {
    const elements = msg.elements;
    const sourceTabId = msg.tabId || activeTabId;
    if (!elements || !sourceTabId) return;

    console.log('[NeuroAdapt] Received DOM snapshot with', elements.length, 'elements. Classifying...');

    (async () => {
      try {
        // Send elements to Ollama for classification
        const raw = await callBackend({
          mode: 'classify',
          pageTitle: pageContext.title || '',
          pageText: (pageContext.text || '').slice(0, 4000),
          userMessage: JSON.stringify(elements, null, 1),
        });

        // Parse the AI response
        let classifications;
        try {
          let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          classifications = JSON.parse(cleaned);
          if (!Array.isArray(classifications)) {
            const arrMatch = cleaned.match(/\[[\s\S]*\]/);
            if (arrMatch) classifications = JSON.parse(arrMatch[0]);
          }
        } catch {
          const arrMatch = raw.match(/\[[\s\S]*\]/);
          if (arrMatch) classifications = JSON.parse(arrMatch[0]);
          else throw new Error('AI did not return valid JSON');
        }

        if (!Array.isArray(classifications)) throw new Error('Expected array from AI.');

        // Normalize classifications
        const validTypes = ['essential', 'supplementary', 'distraction', 'highlight'];
        classifications = classifications.map((item, i) => ({
          index: item.index ?? i,
          classification: validTypes.includes(item.classification) ? item.classification : 'distraction',
          reason: item.reason ?? '',
        }));

        const hidden = classifications.filter(e => e.classification === 'distraction').length;
        const kept = classifications.filter(e => e.classification === 'essential' || e.classification === 'highlight').length;
        console.log(`[NeuroAdapt] Classification done: ${hidden} distractions hidden, ${kept} essential kept.`);

        // Send classifications back to the content script to apply
        chrome.tabs.sendMessage(sourceTabId, {
          type: 'FOCUS_AGENT_RESULT',
          classifications: classifications,
        }).catch(() => {});

      } catch (err) {
        console.warn('[NeuroAdapt] AI classification failed, using fallback:', err.message);
        // Fallback: use simple rule-based classification
        const fallback = elements.map((el, i) => ({
          index: i,
          classification: ['article', 'main', 'h1', 'h2', 'h3', 'p', 'section'].includes(el.tag) ? 'essential' : 'distraction',
          reason: 'fallback',
        }));
        chrome.tabs.sendMessage(sourceTabId, {
          type: 'FOCUS_AGENT_RESULT',
          classifications: fallback,
        }).catch(() => {});
      }
    })();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── SETTINGS ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

settingsBtn?.addEventListener('click', () => settingsOverlay?.classList.add('open'));
settingsClose?.addEventListener('click', () => settingsOverlay?.classList.remove('open'));

$('backend-url-save')?.addEventListener('click', () => {
  const v = $('backend-url-input').value.trim();
  if (v) {
    BACKEND_URL = v;
    chrome.storage.local.set({ backendUrl: v });
  }
});

$('ollama-model-save')?.addEventListener('click', () => {
  const v = $('ollama-model-input').value.trim();
  if (v) {
    ollamaModel = v;
    chrome.storage.local.set({ ollamaModel: v });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── INIT ──────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

chrome.storage.local.get(['backendUrl', 'ollamaModel', 'fatigueScore', 'lastMetrics', 'focusModeActive'], data => {
  if (data.backendUrl) {
    BACKEND_URL = data.backendUrl;
    $('backend-url-input').value = BACKEND_URL;
  }
  if (data.ollamaModel) {
    ollamaModel = data.ollamaModel;
    $('ollama-model-input').value = ollamaModel;
  }
  updateGauge(data.fatigueScore || 0);
  updateMetrics(data.lastMetrics || {});
  
  if (data.focusModeActive) {
    focusToggle.checked = true;
    focusModeActive = true;
    if (focusStatus) focusStatus.textContent = 'On — AI cleaning page';
  }
});

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  if (tabs[0]) onActiveTabChanged(tabs[0].id);
});