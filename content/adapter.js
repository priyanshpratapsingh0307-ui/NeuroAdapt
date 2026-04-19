// clarity/content/adapter.js
// Applies progressive UI adaptations based on fatigue score

(function () {
  if (window.__clarityAdapterLoaded) return;
  window.__clarityAdapterLoaded = true;

  let currentLevel = 0;
  let focusModeActive = false;
  let toastTimeout = null;
  let breakNudgeShown = false;
  let hardInterventionTimer = null;
  let lastLevelThreeStart   = null;
  let lastFatigueScore      = 0;

  // ── Fatigue level thresholds ─────────────────────────────────────────────────
  function getLevel(score) {
    if (score < 25) return 0;
    if (score < 50) return 1;
    if (score < 75) return 2;
    return 3;
  }

  // ── Page context extraction ──────────────────────────────────────────────────
  function extractPageText() {
    const selectors = ['article', 'main', '[role="main"]', '.content', '.post-content',
                       '.entry-content', '#content', '.article-body', '.story-body'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 200) {
        return el.innerText.trim().slice(0, 14000);
      }
    }
    // Fallback: body minus noise
    const clone = document.body.cloneNode(true);
    ['nav', 'footer', 'aside', 'header', 'script', 'style', 'noscript'].forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });
    return clone.innerText.trim().slice(0, 14000);
  }

  // ── Toast notification ───────────────────────────────────────────────────────
  function showToast(message, duration = 5000, actions = []) {
    const existing = document.getElementById('clarity-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'clarity-toast';
    toast.className = 'clarity-toast';
    toast.innerHTML = `
      <div class="clarity-toast-icon">◎</div>
      <div class="clarity-toast-body">
        <p class="clarity-toast-msg">${message}</p>
        ${actions.length ? `<div class="clarity-toast-actions">
          ${actions.map(a => `<button class="clarity-toast-btn" data-action="${a.action}">${a.label}</button>`).join('')}
          <button class="clarity-toast-dismiss">Dismiss</button>
        </div>` : ''}
      </div>
      <button class="clarity-toast-close">✕</button>
    `;

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('clarity-toast--visible'));

    toast.querySelector('.clarity-toast-close')?.addEventListener('click', () => {
      toast.classList.remove('clarity-toast--visible');
      setTimeout(() => toast.remove(), 300);
    });

    toast.querySelector('.clarity-toast-dismiss')?.addEventListener('click', () => {
      toast.classList.remove('clarity-toast--visible');
      setTimeout(() => toast.remove(), 300);
    });

    toast.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'focus_mode') activateFocusMode();
        if (action === 'dismiss_break') breakNudgeShown = true;
        toast.classList.remove('clarity-toast--visible');
        setTimeout(() => toast.remove(), 300);
      });
    });

    if (duration > 0) {
      toastTimeout = setTimeout(() => {
        toast.classList.remove('clarity-toast--visible');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }

  // ── Passive adaptations by level ─────────────────────────────────────────────
  function applyAdaptation(level) {
    document.documentElement.classList.remove(
      'clarity-level-0', 'clarity-level-1', 'clarity-level-2', 'clarity-level-3'
    );
    document.documentElement.classList.add(`clarity-level-${level}`);

    if (level !== currentLevel) {
      currentLevel = level;
      chrome.storage.local.set({ currentLevel: level });
    }
  }

  // ── Focus mode ───────────────────────────────────────────────────────────────
  function activateFocusMode() {
    if (focusModeActive) return;
    focusModeActive = true;
    document.documentElement.classList.add('clarity-focus');
    chrome.storage.local.set({ focusModeActive: true });
  }

  function deactivateFocusMode() {
    focusModeActive = false;
    document.documentElement.classList.remove('clarity-focus');
    document.documentElement.style.removeProperty('--clarity-font-scale');
    document.documentElement.style.removeProperty('--clarity-line-scale');
    chrome.storage.local.set({ focusModeActive: false });
  }

  // ── Break nudge ──────────────────────────────────────────────────────────────
  function checkBreakNudge(sessionMinutes) {
    if (!breakNudgeShown && sessionMinutes >= 120) {
      breakNudgeShown = true;
      showToast(
        `You've been browsing for ${Math.round(sessionMinutes)} minutes. A short break can help restore focus.`,
        0,
        [{ label: 'Take a break', action: 'dismiss_break' }]
      );
    }
  }

  // ── Message listener ──────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {

      case 'GET_PAGE_CONTEXT':
        sendResponse({
          text: extractPageText(),
          title: document.title,
          url: location.href,
        });
        return true; // async

      case 'APPLY_LEVEL':
        applyAdaptation(msg.level);
        break;

      case 'SHOW_TOAST':
        showToast(msg.message, msg.duration, msg.actions || []);
        break;

      case 'ACTIVATE_FOCUS':
        activateFocusMode();
        break;

      case 'DEACTIVATE_FOCUS':
        deactivateFocusMode();
        break;

      case 'CHECK_BREAK':
        checkBreakNudge(msg.sessionMinutes);
        break;

      case 'SET_FONT_SCALE':
        document.documentElement.style.setProperty('--clarity-font-scale', msg.value);
        break;

      case 'SET_LINE_SCALE':
        document.documentElement.style.setProperty('--clarity-line-scale', msg.value);
        break;

      case 'CLARITY_METRICS_UPDATE': {
        lastFatigueScore = msg.fatigueScore;
        const level = getLevel(msg.fatigueScore);
        applyAdaptation(level);

        // ── Hard intervention at level 3 ──────────────────────────────────────
        if (level === 3 && !focusModeActive) {
          if (!lastLevelThreeStart) lastLevelThreeStart = Date.now();
          if (!hardInterventionTimer) {
            hardInterventionTimer = setTimeout(() => {
              if (getLevel(lastFatigueScore || 100) >= 3 && !focusModeActive) {
                activateFocusMode();
                showToast(
                  '⚠ High cognitive load — Focus Mode enabled automatically to protect your attention.',
                  8000
                );
              }
              hardInterventionTimer = null;
            }, 120000); // 2 minutes
          }
        } else {
          lastLevelThreeStart = null;
          if (hardInterventionTimer) { clearTimeout(hardInterventionTimer); hardInterventionTimer = null; }
        }

        // ── Auto-suggest focus mode at level 2+ ───────────────────────────────
        if (level >= 2 && !focusModeActive) {
          const key = `clarity_focus_suggested_${Math.floor(Date.now() / 300000)}`;
          chrome.storage.local.get(key, (data) => {
            if (!data[key]) {
              chrome.storage.local.set({ [key]: true });
              showToast(
                'High cognitive load detected. Open the Clarity sidebar and enable Focus Mode.',
                8000
              );
            }
          });
        }

        checkBreakNudge(msg.sessionMinutes);
        break;
      }

      case 'RESET_SESSION':
        breakNudgeShown = false;
        break;
    }
  });

  // ── Restore state on load ────────────────────────────────────────────────────
  chrome.storage.local.get(['focusModeActive', 'currentLevel'], (data) => {
    if (data.focusModeActive) activateFocusMode();
    if (data.currentLevel !== undefined) applyAdaptation(data.currentLevel);
  });
})();
