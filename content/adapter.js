// clarity/content/adapter.js
// Applies progressive UI adaptations based on fatigue score

(function () {
  if (window.__clarityAdapterLoaded) return;
  window.__clarityAdapterLoaded = true;

  let currentLevel = 0; // 0 = normal, 1 = mild, 2 = moderate, 3 = high
  let focusModeActive = false;
  let toastTimeout = null;
  let breakNudgeShown = false;

  // ── Fatigue level thresholds ────────────────────────────────────────────────
  const LEVELS = [
    { min: 0,  max: 25, label: 'Normal',   color: '#4ade80' },
    { min: 25, max: 50, label: 'Mild',     color: '#facc15' },
    { min: 50, max: 75, label: 'Moderate', color: '#fb923c' },
    { min: 75, max: 100, label: 'High',   color: '#f87171' },
  ];

  function getLevel(score) {
    if (score < 25) return 0;
    if (score < 50) return 1;
    if (score < 75) return 2;
    return 3;
  }

  // ── Toast notification ──────────────────────────────────────────────────────
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

    // Animate in
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
        chrome.runtime.sendMessage({ type: 'TOAST_ACTION', action });
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

  // ── Passive adaptations by level ────────────────────────────────────────────
  function applyAdaptation(level) {
    // Remove all levels
    document.documentElement.classList.remove(
      'clarity-level-0', 'clarity-level-1', 'clarity-level-2', 'clarity-level-3'
    );
    document.documentElement.classList.add(`clarity-level-${level}`);

    if (level !== currentLevel) {
      currentLevel = level;
      chrome.storage.local.set({ currentLevel: level });
    }
  }

  // ── Focus mode ──────────────────────────────────────────────────────────────
  function activateFocusMode() {
    if (focusModeActive) return;
    focusModeActive = true;
    document.documentElement.classList.add('clarity-focus');
    chrome.storage.local.set({ focusModeActive: true });

    // Inject reading toolbar
    const toolbar = document.createElement('div');
    toolbar.id = 'clarity-focus-toolbar';
    toolbar.innerHTML = `
      <span class="clarity-focus-label">◎ Focus Mode</span>
      <div class="clarity-focus-controls">
        <button id="clarity-font-dec">A−</button>
        <button id="clarity-font-inc">A+</button>
        <button id="clarity-focus-exit">Exit</button>
      </div>
    `;
    document.body.prepend(toolbar);

    let fontScale = 1;
    document.getElementById('clarity-font-inc').addEventListener('click', () => {
      fontScale = Math.min(fontScale + 0.1, 1.6);
      document.documentElement.style.setProperty('--clarity-font-scale', fontScale);
    });
    document.getElementById('clarity-font-dec').addEventListener('click', () => {
      fontScale = Math.max(fontScale - 0.1, 0.8);
      document.documentElement.style.setProperty('--clarity-font-scale', fontScale);
    });
    document.getElementById('clarity-focus-exit').addEventListener('click', deactivateFocusMode);
  }

  function deactivateFocusMode() {
    focusModeActive = false;
    document.documentElement.classList.remove('clarity-focus');
    document.documentElement.style.removeProperty('--clarity-font-scale');
    document.getElementById('clarity-focus-toolbar')?.remove();
    chrome.storage.local.set({ focusModeActive: false });
  }

  // ── Break nudge ─────────────────────────────────────────────────────────────
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

  // ── Message listener ────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
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

      case 'CLARITY_METRICS_UPDATE':
        const level = getLevel(msg.fatigueScore);
        applyAdaptation(level);

        // Auto-suggest focus mode at level 2+
        if (level >= 2 && !focusModeActive) {
          const key = `clarity_focus_suggested_${Math.floor(Date.now() / 300000)}`; // once per 5min
          chrome.storage.local.get(key, (data) => {
            if (!data[key]) {
              chrome.storage.local.set({ [key]: true });
              showToast(
                'High cognitive load detected. Would you like to enable Focus Mode?',
                8000,
                [{ label: 'Enable Focus Mode', action: 'focus_mode' }]
              );
            }
          });
        }

        checkBreakNudge(msg.sessionMinutes);
        break;
    }
  });

  // ── Restore state on load ───────────────────────────────────────────────────
  chrome.storage.local.get(['focusModeActive', 'currentLevel'], (data) => {
    if (data.focusModeActive) activateFocusMode();
    if (data.currentLevel !== undefined) applyAdaptation(data.currentLevel);
  });
})();
