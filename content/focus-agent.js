// clarity/content/focus-agent.js
// Walks the live DOM, sends a snapshot to the sidebar for AI classification,
// then applies or restores element visibility based on the result.

(function () {
  if (window.__clarityFocusAgentLoaded) return;
  window.__clarityFocusAgentLoaded = true;

  // Registry: index → { el, lastClassification }
  const elementRegistry = [];
  let lastClassifications = [];

  // ── YouTube detection ─────────────────────────────────────────────────────
  function isYouTubePage() {
    return window.location.host.includes('youtube.com');
  }

  function isYouTubeWatchPage() {
    return isYouTubePage() && window.location.pathname.includes('/watch');
  }

  // YouTube-protected element IDs/selectors that should NEVER be hidden
  const YOUTUBE_PROTECTED = [
    'movie_player', 'player', 'player-container', 'player-container-inner',
    'player-container-outer', 'ytd-player', 'above-the-fold',
    'info-contents', 'meta-contents', 'watch-metadata',
  ];

  function isYouTubeProtected(el) {
    if (!isYouTubePage()) return false;
    // Protect the element if it IS or CONTAINS the video player
    if (el.id && YOUTUBE_PROTECTED.includes(el.id)) return true;
    if (el.tagName === 'VIDEO') return true;
    if (el.tagName === 'YTD-PLAYER') return true;
    if (el.tagName === 'YTD-WATCH-FLEXY') return true;
    if (el.querySelector && el.querySelector('video, #movie_player')) return true;
    return false;
  }

  // ── Build DOM snapshot ───────────────────────────────────────────────────────
  function buildSnapshot() {
    elementRegistry.length = 0;
    lastClassifications = [];

    const children = Array.from(document.body.children);
    const snapshot  = [];

    children.forEach((el) => {
      // Skip our own injected UI
      if (el.id && el.id.startsWith('clarity-')) return;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META'].includes(el.tagName)) return;

      const rect   = el.getBoundingClientRect();
      const text   = el.innerText?.trim() || '';
      const imgs   = el.querySelectorAll('img').length;
      const links  = el.querySelectorAll('a').length;
      const inputs = el.querySelectorAll('input,button,select,textarea').length;

      const idx = snapshot.length;
      elementRegistry.push({ index: idx, el });

      snapshot.push({
        index: idx,
        tag: el.tagName.toLowerCase(),
        id: el.id?.slice(0, 40) || '',
        classes: el.className?.toString().replace(/\s+/g, ' ').trim().slice(0, 80) || '',
        role: el.getAttribute('role') || '',
        ariaLabel: el.getAttribute('aria-label')?.slice(0, 40) || '',
        textLen: text.length,
        textSnippet: text.slice(0, 80),
        imgCount: imgs,
        linkCount: links,
        inputCount: inputs,
        childCount: el.children.length,
        offsetTop: Math.round(rect.top + window.scrollY),
        height: Math.round(rect.height),
        aboveFold: rect.top < window.innerHeight,
        isYouTubeProtected: isYouTubeProtected(el),
      });
    });

    return snapshot;
  }

  // ── Apply classifications ────────────────────────────────────────────────────
  function applyClassifications(classifications) {
    if (!Array.isArray(classifications)) return;
    lastClassifications = classifications;

    classifications.forEach(({ index, classification }) => {
      const entry = elementRegistry[index];
      if (!entry) return;
      const { el } = entry;
      if (el.id === 'clarity-focus-toolbar') return;

      // Clear previous classes first
      el.classList.remove(
        'clarity-distraction-hidden',
        'clarity-distraction-dimmed',
        'clarity-distraction-supplementary',
        'clarity-highlight',
        'clarity-essential'
      );

      // YouTube video player must NEVER be dimmed
      if (isYouTubeProtected(el)) {
        el.classList.add('clarity-essential');
        return;
      }

      if (classification === 'distraction') {
        el.classList.add('clarity-distraction-dimmed');
      } else if (classification === 'supplementary') {
        el.classList.add('clarity-distraction-supplementary');
      } else if (classification === 'highlight') {
        el.classList.add('clarity-highlight');
      } else if (classification === 'essential') {
        el.classList.add('clarity-essential');
      }
    });

    // Remove the scanning overlay now that classification is done
    document.documentElement.classList.remove('clarity-focus-scanning');
  }

  // ── Restore all elements ─────────────────────────────────────────────────────
  function restoreAll() {
    elementRegistry.forEach(({ el }) => {
      el.classList.remove(
        'clarity-distraction-hidden',
        'clarity-distraction-dimmed',
        'clarity-distraction-supplementary',
        'clarity-highlight',
        'clarity-essential'
      );
    });
    document.documentElement.classList.remove(
      'clarity-focus', 'clarity-focus-scanning'
    );
  }

  // ── Re-apply stored classifications ──────────────────────────────────────────
  function reApplyClassifications() {
    if (lastClassifications.length > 0) {
      applyClassifications(lastClassifications);
    }
  }

  // ── Message listener ─────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {

      case 'REQUEST_DOM_SNAPSHOT': {
        // Add scanning overlay to indicate AI is working
        document.documentElement.classList.add('clarity-focus', 'clarity-focus-scanning');

        const elements = buildSnapshot();
        chrome.runtime.sendMessage({ type: 'DOM_SNAPSHOT', elements }).catch(() => {});
        break;
      }

      case 'FOCUS_AGENT_RESULT': {
        applyClassifications(msg.classifications);
        break;
      }

      case 'RESTORE_DISTRACTIONS': {
        restoreAll();
        break;
      }

      case 'APPLY_DISTRACTIONS': {
        // Re-hide after the "Show all" toggle was used
        reApplyClassifications();
        break;
      }

      case 'DEACTIVATE_FOCUS': {
        restoreAll();
        lastClassifications = [];
        break;
      }
    }
  });
})();
