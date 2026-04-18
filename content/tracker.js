// clarity/content/tracker.js
// Passively collects cognitive load signals — never interrupts the user

(function () {
  if (window.__clarityTrackerLoaded) return;
  window.__clarityTrackerLoaded = true;

  const BATCH_INTERVAL = 3000; // 3 seconds

  // ── Signal buffers ──────────────────────────────────────────────────────────
  let signals = {
    keystrokes: [],         // timestamps
    backspaces: 0,          // error corrections
    wordCount: 0,
    scrollEvents: [],       // { ts, delta }
    cursorPositions: [],    // { ts, x, y }
    clicks: [],             // { ts, x, y }
    idleStart: null,
    sessionStart: Date.now(),
  };

  let lastKeyTime = null;
  let lastScrollTime = null;
  let lastScrollY = window.scrollY;

  // ── Keyboard tracking ───────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const now = Date.now();
    signals.keystrokes.push(now);

    if (e.key === 'Backspace' || e.key === 'Delete') {
      signals.backspaces++;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      signals.wordCount++;
    }

    lastKeyTime = now;
    signals.idleStart = null;
  }, true);

  // ── Mouse / cursor jitter tracking ─────────────────────────────────────────
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    // Sample every 100ms max to keep memory low
    const last = signals.cursorPositions[signals.cursorPositions.length - 1];
    if (!last || now - last.ts >= 100) {
      signals.cursorPositions.push({ ts: now, x: e.clientX, y: e.clientY });
      if (signals.cursorPositions.length > 300) signals.cursorPositions.shift();
    }
    signals.idleStart = null;
  }, { passive: true });

  // ── Click / mis-click tracking ──────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    signals.clicks.push({ ts: Date.now(), x: e.clientX, y: e.clientY });
    if (signals.clicks.length > 100) signals.clicks.shift();
  }, true);

  // ── Scroll tracking ─────────────────────────────────────────────────────────
  document.addEventListener('scroll', () => {
    const now = Date.now();
    const delta = Math.abs(window.scrollY - lastScrollY);
    signals.scrollEvents.push({ ts: now, delta });
    if (signals.scrollEvents.length > 200) signals.scrollEvents.shift();
    lastScrollY = window.scrollY;
    lastScrollTime = now;
  }, { passive: true });

  // ── Idle detection ──────────────────────────────────────────────────────────
  document.addEventListener('mousemove', () => { signals.idleStart = null; }, { passive: true });

  function checkIdle() {
    const now = Date.now();
    const lastActive = Math.max(lastKeyTime || 0, lastScrollTime || 0);
    if (lastActive && now - lastActive > 10000 && !signals.idleStart) {
      signals.idleStart = now;
    }
  }

  // ── Compute metrics ─────────────────────────────────────────────────────────
  function computeMetrics() {
    const now = Date.now();
    const window3s = now - BATCH_INTERVAL;

    // 1. Typing speed (WPM over last interval)
    const recentKeys = signals.keystrokes.filter(t => t >= window3s);
    const wpm = (signals.wordCount / ((now - signals.sessionStart) / 60000)) || 0;

    // 2. Error rate (backspaces / total keystrokes)
    const totalKeys = signals.keystrokes.length;
    const errorRate = totalKeys > 5 ? signals.backspaces / totalKeys : 0;

    // 3. Cursor jitter — mean distance between consecutive samples
    const pts = signals.cursorPositions.filter(p => p.ts >= window3s);
    let jitter = 0;
    if (pts.length > 2) {
      let totalDist = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        totalDist += Math.sqrt(dx * dx + dy * dy);
      }
      jitter = totalDist / pts.length; // avg px per sample
    }

    // 4. Scroll irregularity (std dev of scroll deltas)
    const recentScrolls = signals.scrollEvents.filter(s => s.ts >= window3s);
    let scrollIrregularity = 0;
    if (recentScrolls.length > 2) {
      const deltas = recentScrolls.map(s => s.delta);
      const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      const variance = deltas.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / deltas.length;
      scrollIrregularity = Math.sqrt(variance);
    }

    // 5. Repeated clicks in same area (within 30px radius, within 2s)
    let repeatedClicks = 0;
    const recentClicks = signals.clicks.filter(c => c.ts >= window3s);
    for (let i = 0; i < recentClicks.length; i++) {
      for (let j = i + 1; j < recentClicks.length; j++) {
        const dx = recentClicks[i].x - recentClicks[j].x;
        const dy = recentClicks[i].y - recentClicks[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < 30 && Math.abs(recentClicks[i].ts - recentClicks[j].ts) < 2000) {
          repeatedClicks++;
        }
      }
    }

    // 6. Session duration (minutes)
    const sessionMinutes = (now - signals.sessionStart) / 60000;

    return {
      wpm: Math.round(wpm),
      errorRate: Math.round(errorRate * 100) / 100,
      jitter: Math.round(jitter),
      scrollIrregularity: Math.round(scrollIrregularity),
      repeatedClicks,
      sessionMinutes: Math.round(sessionMinutes),
      activeKeystrokes: recentKeys.length,
      timestamp: now,
    };
  }

  // ── Fatigue score computation ───────────────────────────────────────────────
  function computeFatigueScore(metrics) {
    let score = 0; // 0–100

    // Error rate: 0 = 0pts, 0.3+ = 30pts
    score += Math.min(metrics.errorRate / 0.3, 1) * 30;

    // Cursor jitter: 0 = 0pts, 50px+ avg = 20pts
    score += Math.min(metrics.jitter / 50, 1) * 20;

    // Scroll irregularity: 0 = 0pts, 100+ = 15pts
    score += Math.min(metrics.scrollIrregularity / 100, 1) * 15;

    // Repeated clicks: 0 = 0pts, 5+ = 20pts
    score += Math.min(metrics.repeatedClicks / 5, 1) * 20;

    // Session duration: 0 = 0pts, 120min+ = 15pts
    score += Math.min(metrics.sessionMinutes / 120, 1) * 15;

    return Math.min(Math.round(score), 100);
  }

  // ── Batch send to background ────────────────────────────────────────────────
  function sendBatch() {
    checkIdle();
    const metrics = computeMetrics();
    const fatigueScore = computeFatigueScore(metrics);

    chrome.runtime.sendMessage({
      type: 'CLARITY_METRICS',
      payload: { metrics, fatigueScore }
    }).catch(() => {}); // ignore if popup closed

    // Reset short-window counters (keep session-level ones)
    signals.backspaces = 0;
    signals.wordCount = 0;
  }

  setInterval(sendBatch, BATCH_INTERVAL);

  // Listen for commands from popup / background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GET_METRICS') {
      const metrics = computeMetrics();
      const fatigueScore = computeFatigueScore(metrics);
      return Promise.resolve({ metrics, fatigueScore });
    }
    if (msg.type === 'RESET_SESSION') {
      signals.sessionStart = Date.now();
      signals.keystrokes = [];
      signals.backspaces = 0;
      signals.wordCount = 0;
      signals.clicks = [];
    }
  });
})();
