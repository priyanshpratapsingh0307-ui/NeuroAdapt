// clarity/content/summarizer.js
// Injected on demand — extracts page content, calls Claude API, shows overlay

(function () {
  // ── Extract readable text from page ────────────────────────────────────────
  function extractContent() {
    // Prefer article/main content
    const selectors = ['article', 'main', '[role="main"]', '.content', '.post-content', '.entry-content', '#content'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 200) {
        return el.innerText.trim().slice(0, 6000);
      }
    }
    // Fallback: body text minus nav/footer/aside
    const clone = document.body.cloneNode(true);
    ['nav', 'footer', 'aside', 'header', 'script', 'style', 'noscript'].forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });
    return clone.innerText.trim().slice(0, 6000);
  }

  // ── Show summary overlay ───────────────────────────────────────────────────
  function showOverlay(state, content = '') {
    let overlay = document.getElementById('clarity-summary-overlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'clarity-summary-overlay';
      overlay.innerHTML = `
        <div id="clarity-summary-panel">
          <div class="clarity-summary-header">
            <span class="clarity-summary-title">◎ Page Summary</span>
            <button class="clarity-summary-close" id="clarity-summary-close">✕</button>
          </div>
          <div class="clarity-summary-content" id="clarity-summary-content"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('clarity-summary-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    const contentEl = document.getElementById('clarity-summary-content');

    if (state === 'loading') {
      contentEl.innerHTML = `
        <div class="clarity-summary-loading">
          <div>
            <span class="clarity-summary-loading-dot"></span>
            <span class="clarity-summary-loading-dot"></span>
            <span class="clarity-summary-loading-dot"></span>
          </div>
          <p style="margin-top:12px;font-size:13px;color:#64748b;">Summarising page…</p>
        </div>
      `;
    } else if (state === 'done') {
      contentEl.innerHTML = content;
    } else if (state === 'error') {
      contentEl.innerHTML = `<p style="color:#f87171;">${content}</p>`;
    }
  }

  // ── Call Claude API ────────────────────────────────────────────────────────
  async function summarizePage() {
    showOverlay('loading');
    const pageText = extractContent();

    if (!pageText || pageText.length < 100) {
      showOverlay('error', 'Not enough content found on this page to summarise.');
      return;
    }

    const prompt = `You are a helpful reading assistant for people with cognitive fatigue, ADHD, or post-concussion syndrome.

Summarise the following webpage content. Your output must be:
- A short title (max 8 words) that captures the main topic
- 4 to 6 clear, plain-language bullet points
- Each bullet should be one sentence, easy to read, no jargon

Respond ONLY with valid JSON in this exact format:
{
  "title": "...",
  "bullets": ["...", "...", "..."]
}

Webpage content:
${pageText}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();
      const raw = data.content?.[0]?.text || '';

      let parsed;
      try {
        const clean = raw.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch {
        throw new Error('Could not parse response.');
      }

      const html = `
        <h3>${parsed.title || 'Summary'}</h3>
        <ul>
          ${(parsed.bullets || []).map(b => `<li>${b}</li>`).join('')}
        </ul>
      `;
      showOverlay('done', html);

    } catch (err) {
      console.error('[Clarity] Summarise error:', err);
      showOverlay('error', `Could not generate summary: ${err.message}`);
    }
  }

  // ── Listen for trigger ─────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'REQUEST_SUMMARY') {
      summarizePage();
    }
  });

  // Auto-trigger if this script was injected directly
  summarizePage();
})();
