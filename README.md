# ◎ NeuroAdapt — Cognitive Fatigue Adapter

A browser extension that passively monitors cognitive load signals and progressively simplifies your browsing experience — no configuration needed.

---

## How to Install in Chrome (Developer Mode)

1. **Download & unzip** the `NeuroAdapt-extension` folder somewhere on your computer.
2. Open Chrome and navigate to `chrome://extensions`
3. Toggle **"Developer mode"** ON (top-right corner)
4. Click **"Load unpacked"**
5. Select the `NeuroAdapt-extension` folder
6. The ◎ NeuroAdapt icon will appear in your toolbar

**To pin the icon:** Click the puzzle piece (extensions) icon → click the pin next to Clarity.

---

## Features

### 🧠 Passive Fatigue Detection
Every 3 seconds, NeuroAdapt silently measures:
- **Typing speed & error rate** — more backspaces = higher cognitive load
- **Cursor jitter** — erratic mouse movement signals difficulty
- **Scroll irregularity** — back-and-forth scrolling indicates re-reading
- **Repeated clicks** — clicking the same area multiple times
- **Session duration** — long sessions increase baseline fatigue
- **Tab switching frequency** — frequent tab changes indicate distraction and reduced focus

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
Get AI-generated bullet-point summaries of any page, designed for low-fatigue consumption using clear, plain language and no jargon. Summarization is automatically triggered during rapid scrolling to provide key insights without interrupting the user’s flow. Users can also ask follow-up questions at the end, which are restricted strictly to the content of the page to ensure relevance and focus.

### ↺ Break Nudges
After 2 hours of continuous browsing, a gentle toast appears suggesting a break. It also provides options for a brief breathing exercise, listening to brown noise, or switching to Focus Mode to help restore attention and reduce fatigue.

### Auto-suggestions
When fatigue reaches Moderate level, NeuroAdapt asks if you'd like to enable Focus Mode automatically.

### Therapist
A list of nearby therapists is provided as an optional resource for additional support.

### Dashboard
A dashboard is also available, providing a comprehensive history of user sessions along with deeper insights into overall activity and cognitive patterns.

---

## File Structure

```
NeuroAdapt-extension/
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
