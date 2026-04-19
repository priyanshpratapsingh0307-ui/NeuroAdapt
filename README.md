# ◎ NeuroAdapt — Cognitive Fatigue Adapter

A browser extension that passively monitors cognitive load signals and progressively simplifies your browsing experience — no configuration needed.

---

## How to Install in Chrome (Developer Mode)

1. **Download & unzip** the `clarity-extension` folder somewhere on your computer.
2. Open Chrome and navigate to `chrome://extensions`
3. Toggle **"Developer mode"** ON (top-right corner)
4. Click **"Load unpacked"**
5. Select the `clarity-extension` folder
6. The ◎ Clarity icon will appear in your toolbar

**To pin the icon:** Click the puzzle piece (extensions) icon → click the pin next to Clarity.

---

## Features

### 🧠 Passive Fatigue Detection
Every 3 seconds, Clarity silently measures:
- **Typing speed & error rate** — more backspaces = higher cognitive load
- **Cursor jitter** — erratic mouse movement signals difficulty
- **Scroll irregularity** — back-and-forth scrolling indicates re-reading
- **Repeated clicks** — clicking the same area multiple times
- **Session duration** — long sessions increase baseline fatigue

### 📊 Fatigue Score (0–100)
| Score | Level    | Adaptations Applied |
|-------|----------|---------------------|
| 0–24  | Normal   | None |
| 25–49 | Mild     | Slightly larger text, faster animations reduced |
| 50–74 | Moderate | Larger text, ads hidden, animations disabled |
| 75–100| High     | Max simplification, decorative elements removed, warm overlay |

### ◈ Focus Mode
Click the extension → toggle Focus Mode to:
- Restrict page width to 760px for comfortable reading
- Switch to a readable serif font (Georgia)
- Remove nav, sidebars, ads, comment sections
- Enable font size controls (A− / A+)

### ◉ Summarise Page
Get AI-generated bullet-point summaries of any page. Designed for low-fatigue consumption — plain language, no jargon.

### ↺ Break Nudges
After 2 hours of continuous browsing, a gentle toast appears suggesting a break.

### Auto-suggestions
When fatigue reaches Moderate level, Clarity asks if you'd like to enable Focus Mode automatically.

---

## File Structure

```
clarity-extension/
├── manifest.json              # Extension config
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.css              # Popup styles
│   └── popup.js               # Popup logic
├── content/
│   ├── tracker.js             # Signal collection (passive)
│   ├── adapter.js             # UI adaptation engine
│   ├── adapter.css            # Injected page styles
│   └── summarizer.js          # Page summarization
└── background/
    └── service-worker.js      # Background state & routing
```

---

## Notes
- Summarize Page uses the Anthropic API — works in Claude.ai environment
- All tracking is local — no data leaves your device except for the summarization call
- The extension resets session data on every new browser session

---

Built with care for people with ADHD, post-concussion syndrome, and chronic fatigue.
