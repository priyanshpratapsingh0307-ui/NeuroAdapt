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
  let hyperfocusToastShown  = false;
  let fatigueHighStartTime  = null;
  let microBreakSnoozedUntil = 0;

  // ── Sensory Noise Filter State ────────────────────────────────────────────
  let sensoryFilterOverride = false;
  let sensoryLevel = 0;

  // ── Adaptive UI: step-based scaling state ─────────────────────────────────
  let sustainedSpikeCount = 0;
  let currentFontScale = 1.0;
  let currentLineScale = 1.0;
  let currentLetterSpacing = 0.0;
  
  // A 0.40 multiplier bump represents a much more significant jump (roughly +6.5px on 16px font)
  const SCALE_BUMP = 0.40;

  /**
   * Compute step-based UI adaptation.
   * As long as fatigue is spiked (>= 50), it bumps font size up significantly (0.40 scale)
   * every 3 seconds until it hits the maximum cap. Does not shrink back.
   * If the spike persists for a long time (30 seconds), it auto-triggers a breathing exercise.
   */
  function applyAdaptiveUI(score) {
    // Detect a spike (Fragile or worse)
    if (score >= 50) {
      sustainedSpikeCount++;
      
      // Auto-trigger breathing exercise if fatigue is sustained for 30 seconds (10 intervals)
      if (sustainedSpikeCount === 10) {
        showToast(
          'Your fatigue has been elevated for a while. Let\'s do a quick breathing exercise.',
          8000,
          [{ label: 'Start Breathing', action: 'start_breathing' }]
        );
      }
      
      // Keep bumping up every 3 seconds as long as fatigue stays high, until cap
      if (currentFontScale < 3.2) { // Raised cap to allow more bumps
        currentFontScale += SCALE_BUMP;
        currentLineScale += SCALE_BUMP * 1.5; // Scale line-height slightly more for readability
        currentLetterSpacing += 0.03;         // Add subtle letter spacing
        
        // Apply immediately
        document.documentElement.style.setProperty('--clarity-font-scale', currentFontScale.toFixed(3));
        document.documentElement.style.setProperty('--clarity-line-scale', currentLineScale.toFixed(3));
        document.documentElement.style.setProperty('--clarity-letter-spacing', currentLetterSpacing.toFixed(4) + 'em');
      }
    } else {
      sustainedSpikeCount = 0; // Spike broken, reset
    }
  }

  // ── Fatigue level thresholds ─────────────────────────────────────────────────
  function getLevel(score) {
    if (score < 25) return 0;
    if (score < 50) return 1;
    if (score < 75) return 2;
    return 3;
  }

  // ── Page context extraction ──────────────────────────────────────────────────
  function extractPageText() {
    // Special case for YouTube
    if (window.location.host.includes('youtube.com') && window.location.pathname.includes('/watch')) {
      return window.location.href; // Send URL so backend can fetch transcript
    }

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

  // ── Smart Blocklist Intervention ──────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TRIGGER_SOFT_BLOCK') {
      showDopamineDelay();
      return;
    }
  });

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
        if (action === 'start_breathing') startBreathingExercise();
        if (action === 'back_to_task') {
            if (history.length > 1) history.back();
            else window.close();
        }
        if (action === 'its_research') chrome.runtime.sendMessage({ type: 'WHITELIST_DOMAIN_FOR_TASK', url: location.href });
        if (action === 'pause_anchor') chrome.runtime.sendMessage({ type: 'STOP_TASK_ANCHOR' });
        
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

  // ── Sensory Noise Filter ──────────────────────────────────────────────────
  function applySensoryFilter(score) {
    if (sensoryFilterOverride) return;

    let newLevel = 0;
    if (score >= 70) newLevel = 2; // Strained
    else if (score >= 40) newLevel = 1; // Fragile
    
    if (newLevel !== sensoryLevel) {
      sensoryLevel = newLevel;
      document.documentElement.classList.remove('clarity-sensory-fragile', 'clarity-sensory-strained');
      
      if (sensoryLevel >= 1) {
        document.documentElement.classList.add('clarity-sensory-fragile');
        freezeMedia();
        showSensoryBanner();
        chrome.runtime.sendMessage({ type: 'MUTE_ACTIVE_TAB' });
      }
      if (sensoryLevel === 2) {
        document.documentElement.classList.add('clarity-sensory-strained');
        activateFocusMode(); 
      }
      if (sensoryLevel === 0) {
        hideSensoryBanner();
      }
    }
  }

  function freezeMedia() {
    document.querySelectorAll('video, audio').forEach(media => {
      media.muted = true;
      try { media.pause(); } catch(e){}
    });
    
    document.querySelectorAll('img').forEach(img => {
      if (img.src && img.src.toLowerCase().includes('.gif')) {
        try {
          if (!img.complete || img.naturalWidth === 0) return;
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, img.width, img.height);
          img.dataset.originalSrc = img.src;
          img.src = canvas.toDataURL();
        } catch(e) {}
      }
    });
  }

  function showSensoryBanner() {
    if (document.getElementById('clarity-sensory-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'clarity-sensory-banner';
    banner.innerHTML = `
      <span>Sensory filter active — some content simplified.</span>
      <button id="clarity-sensory-restore">Restore</button>
    `;
    document.body.appendChild(banner);
    
    document.getElementById('clarity-sensory-restore').addEventListener('click', () => {
      sensoryFilterOverride = true;
      hideSensoryBanner();
      document.documentElement.classList.remove('clarity-sensory-fragile', 'clarity-sensory-strained');
      document.querySelectorAll('video, audio').forEach(media => media.muted = false);
      document.querySelectorAll('img[data-original-src]').forEach(img => {
        img.src = img.dataset.originalSrc;
      });
      chrome.runtime.sendMessage({ type: 'UNMUTE_ACTIVE_TAB' });
      if (sensoryLevel === 2) deactivateFocusMode();
      sensoryLevel = 0;
    });
  }

  function hideSensoryBanner() {
    const banner = document.getElementById('clarity-sensory-banner');
    if (banner) banner.remove();
  }

  function playSoftChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(432, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 3);
    } catch(e) {}
  }

  function showMicroBreakIntervention() {
    if (document.querySelector('.clarity-microbreak-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'clarity-microbreak-overlay';
    overlay.innerHTML = `
      <div class="clarity-microbreak-dialog">
        <div class="clarity-microbreak-header">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
          Your brain needs a moment
        </div>
        <p>Fatigue score is high. A short reset now saves you from prolonged struggling.</p>
        <div class="clarity-microbreak-actions">
          <button data-action="start_breathing">Start breathing</button>
          <button data-action="eye_rest">Eye rest</button>
          <button data-action="blank_rest">Blank rest</button>
          <button data-action="snooze_break" class="clarity-btn-secondary">5 more min</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('clarity-visible'));

    overlay.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        overlay.classList.remove('clarity-visible');
        setTimeout(() => overlay.remove(), 500);

        if (action === 'start_breathing') startBreathingExercise();
        if (action === 'eye_rest') startEyeRest();
        if (action === 'blank_rest') startBlankRest();
        if (action === 'snooze_break') {
          microBreakSnoozedUntil = Date.now() + 5 * 60 * 1000;
        }
      });
    });
  }

  function startEyeRest() {
    const overlay = document.createElement('div');
    overlay.className = 'clarity-eye-rest-overlay clarity-fonts';
    overlay.innerHTML = `
      <div style="text-align:center; color:white; font-family:'DM Sans',sans-serif;">
        <div style="font-size: 24px; margin-bottom: 10px; font-weight:bold;">20-20-20 Rule</div>
        <div style="font-size: 16px; margin-bottom: 20px; color:#ddd;">Look at something 20 feet away.</div>
        <div style="font-size: 64px; font-weight:300;" id="eye-rest-timer">20</div>
      </div>
    `;
    document.body.appendChild(overlay);

    let seconds = 20;
    const text = overlay.querySelector('#eye-rest-timer');
    const interval = setInterval(() => {
      seconds--;
      text.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(interval);
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 1000);
      }
    }, 1000);
  }

  function startBlankRest() {
    const overlay = document.createElement('div');
    overlay.className = 'clarity-blank-rest-overlay';
    document.body.appendChild(overlay);
    
    playSoftChime();

    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 1000);
    }, 120000); // 2 minutes
  }

  // ── Working Memory Aid: Quick Capture ─────────────────────────────────────────
  let quickCaptureOverlay = null;
  function toggleQuickCapture() {
    if (quickCaptureOverlay) {
      quickCaptureOverlay.style.opacity = '0';
      setTimeout(() => {
        if (quickCaptureOverlay) quickCaptureOverlay.remove();
        quickCaptureOverlay = null;
      }, 300);
      return;
    }

    quickCaptureOverlay = document.createElement('div');
    quickCaptureOverlay.id = 'clarity-quick-capture';
    quickCaptureOverlay.innerHTML = `
      <div class="clarity-qc-dialog">
        <div class="clarity-qc-header">Quick Capture</div>
        <input type="text" id="clarity-qc-input" placeholder="What's on your mind? Press Enter to save" autocomplete="off" />
        <div class="clarity-qc-footer">Saved instantly to Working Memory</div>
      </div>
    `;
    document.body.appendChild(quickCaptureOverlay);

    const input = quickCaptureOverlay.querySelector('#clarity-qc-input');
    // small delay to allow DOM to render before focusing
    setTimeout(() => input.focus(), 50);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') toggleQuickCapture();
      if (e.key === 'Enter') {
        const content = input.value.trim();
        if (content) {
          saveMemoryNote(content);
        }
        toggleQuickCapture();
      }
    });
    
    // Close on click outside
    quickCaptureOverlay.addEventListener('click', (e) => {
      if (e.target === quickCaptureOverlay) toggleQuickCapture();
    });
  }

  function saveMemoryNote(content) {
    chrome.storage.local.get(['userId'], (data) => {
      if (!data.userId) return;
      fetch('http://localhost:8000/api/notes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': data.userId },
        body: JSON.stringify({
          content: content,
          note_type: 'thought',
          url: window.location.href,
          domain: window.location.hostname
        })
      }).catch(e => console.error("Failed to save note", e));
    });
  }

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Alt + N for Quick Capture
    if (e.altKey && e.code === 'KeyN') {
      e.preventDefault();
      toggleQuickCapture();
    }
  });

  // ── Smart Blocklist: Soft Block (Dopamine Delay) ──────────────────────────
  function showDopamineDelay() {
    if (document.getElementById('clarity-dopamine-delay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'clarity-dopamine-delay';
    overlay.innerHTML = `
      <div class="clarity-dopamine-dialog">
        <h2>Dopamine Delay Active</h2>
        <p>This site is on your smart blocklist. Take a breath.</p>
        <div class="breathing-circle">
          <div class="breathing-text" id="dd-text">10</div>
        </div>
        <div class="clarity-dopamine-actions" style="display:none;" id="dd-actions">
          <button id="dd-continue">Continue to site</button>
          <button id="dd-close" class="clarity-btn-secondary">Close Tab</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let timeLeft = 10;
    const textEl = overlay.querySelector('#dd-text');
    const interval = setInterval(() => {
      timeLeft--;
      textEl.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(interval);
        textEl.textContent = "Ready";
        overlay.querySelector('#dd-actions').style.display = 'flex';
      }
    }, 1000);

    overlay.querySelector('#dd-continue').addEventListener('click', () => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 500);
    });
    
    overlay.querySelector('#dd-close').addEventListener('click', () => {
      // Send message to background to close the tab
      chrome.runtime.sendMessage({ type: 'CLOSE_ACTIVE_TAB' });
      // Fallback
      window.location.href = 'about:blank';
    });
  }

  // ── Breathing Exercise Overlay ──────────────────────────────────────────────
  function startBreathingExercise() {
    const overlay = document.createElement('div');
    overlay.className = 'clarity-breathing-overlay';
    overlay.innerHTML = `
      <div class="clarity-breathing-circle">
        <div class="clarity-breathing-text">Inhale...</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const circle = overlay.querySelector('.clarity-breathing-circle');
    const text = overlay.querySelector('.clarity-breathing-text');
    
    // 4-7-8 breathing sequence
    requestAnimationFrame(() => {
      text.textContent = 'Breathe in...';
      circle.style.transform = 'scale(1.8)';
      
      setTimeout(() => {
        text.textContent = 'Hold...';
        
        setTimeout(() => {
          text.textContent = 'Exhale slowly...';
          circle.style.transform = 'scale(1)';
          circle.style.transition = 'transform 8s ease-in-out';
          
          setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 1000);
          }, 8000); // 8s exhale
        }, 7000); // 7s hold
      }, 4000); // 4s inhale
    });
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
    // NOTE: we do NOT add 'clarity-focus' here anymore.
    // focus-agent.js adds 'clarity-focus' + 'clarity-focus-scanning' when
    // the DOM snapshot is requested, and removes 'clarity-focus-scanning'
    // once the AI classification arrives. This prevents blanket-dimming.
    chrome.storage.local.set({ focusModeActive: true });
  }

  function deactivateFocusMode() {
    focusModeActive = false;
    document.documentElement.classList.remove(
      'clarity-focus', 'clarity-focus-scanning'
    );
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

      case 'SHOW_DRIFT_ALERT':
        showToast(
          `<b>Drifted from task</b><br>Your anchor: <i>"${msg.taskName}"</i><br>This site might not be related.`,
          0,
          [
            { label: 'Back to task', action: 'back_to_task' },
            { label: "It's research", action: 'its_research' },
            { label: 'Pause anchor', action: 'pause_anchor' }
          ]
        );
        break;

      case 'ACTIVATE_FOCUS':
        activateFocusMode();
        break;

      case 'DEACTIVATE_FOCUS':
        deactivateFocusMode();
        break;

      case 'TRIGGER_BREATHING_EXERCISE':
        startBreathingExercise();
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
        if (msg.isHyperfocused) {
          if (!hyperfocusToastShown) {
            hyperfocusToastShown = true;
            showToast('🔥 Hyperfocus Active - Alerts suppressed', 4000);
          }
          // Suppress further UI adaptations and alerts while hyperfocused
          break;
        } else {
          hyperfocusToastShown = false;
        }

        lastFatigueScore = msg.fatigueScore;
        const level = getLevel(msg.fatigueScore);

        // ── Micro-break Enforcer ──────────────────────────────────────────────
        if (msg.fatigueScore >= 65) {
          if (!fatigueHighStartTime) fatigueHighStartTime = Date.now();
          else if (Date.now() - fatigueHighStartTime >= 5 * 60 * 1000) {
            // 5 minutes sustained >= 65
            if (Date.now() > microBreakSnoozedUntil && !focusModeActive) {
               showMicroBreakIntervention();
               fatigueHighStartTime = null; // reset so it triggers again later if needed
            }
          }
        } else {
          fatigueHighStartTime = null;
        }

        applyAdaptation(level);
        applyAdaptiveUI(msg.fatigueScore); // Progressive font/spacing scaling
        applySensoryFilter(msg.fatigueScore); // Applies the sensory noise filter

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
