import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.core.config import settings
from app.models.models import Session, Suggestion


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_status(score: float) -> str:
    if score >= 70:
        return "strained"
    elif score >= 50:
        return "fragile"
    return "healthy"


def _get_threshold(score: float) -> int:
    return 70 if score >= 70 else 50


async def _get_session_history(user_id: str) -> list[dict]:
    """
    Fetches the last 10 sessions for this user to give Mistral context
    about the user's recent fatigue patterns.
    """
    recent = (
        await Session.find(Session.user_id == user_id)
        .sort(-Session.timestamp)
        .limit(10)
        .to_list()
    )
    return [
        {
            "score": s.fatigue_score,
            "site": s.site_url,
            "duration": s.duration_mins,
            "timestamp": s.timestamp.strftime("%A %I:%M %p"),
        }
        for s in recent
    ]


def _build_prompt(
    session: Session,
    history: list[dict],
    status: str,
    threshold: int,
) -> str:
    """
    Builds the Mistral prompt with full session context.
    The richer the context, the more personalised the suggestion.
    """
    time_of_day = datetime.now(timezone.utc).strftime("%I:%M %p")
    history_text = "\n".join(
        f"  - {h['timestamp']} | Score: {h['score']} | Site: {h['site']} | Duration: {h['duration']} min"
        for h in history
    ) or "  No previous sessions recorded."

    strained_count = sum(1 for h in history if h["score"] >= 70)
    fragile_count  = sum(1 for h in history if 50 <= h["score"] < 70)

    return f"""You are a cognitive health assistant built into a Chrome extension called NeuroAdapt.
You monitor real-time fatigue signals while users browse and work online.

A user's fatigue score just crossed the {threshold} threshold — their current state is: {status.upper()}.

━━━ CURRENT SESSION ━━━
• Fatigue Score     : {session.fatigue_score:.1f} / 100
• Status            : {status.upper()} (threshold crossed: {threshold})
• Typing Speed      : {session.wpm:.1f} WPM
• Error Rate        : {session.error_rate:.1f} errors/min
• Scroll Rate       : {session.scroll_rate:.1f} pages/min
• Click Delay       : {session.click_delay:.0f} ms average
• Rage Clicks       : {session.rage_clicks} events
• Current Site      : {session.site_url}
• Session Duration  : {session.duration_mins:.0f} minutes
• Time of Day       : {time_of_day}

━━━ RECENT SESSION HISTORY (last 10) ━━━
{history_text}

━━━ PATTERN SUMMARY ━━━
• Strained sessions in history : {strained_count}
• Fragile sessions in history  : {fragile_count}

━━━ YOUR TASK ━━━
Write a short, warm, and practical suggestion for this user.

Rules:
1. Be specific — reference their actual numbers (e.g. "your typing speed has dropped to {session.wpm:.0f} WPM")
2. Be concise — 3–4 sentences maximum
3. Give one concrete action they can take RIGHT NOW
4. If status is STRAINED (score ≥ 70), be firmer — recommend stopping work
5. If status is FRAGILE (score 50–69), be gentle — recommend slowing down
6. Do NOT use generic advice like "take a break" alone — be specific about what kind
7. Mention the site they're on if relevant (e.g. Reddit, YouTube = more distracting)
8. End with one encouraging sentence

Do not include any preamble. Start directly with the suggestion.
"""


async def _call_ollama(prompt: str) -> str:
    """
    Calls Ollama's OpenAI-compatible endpoint with the configured model (mistral).
    Raises on any HTTP or connection error.
    """
    url = f"{settings.OLLAMA_BASE_URL}/v1/chat/completions"
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            url,
            json={
                "model": settings.OLLAMA_MODEL,
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


# ─── Main entry point ─────────────────────────────────────────────────────────

async def check_and_generate_suggestion(
    session: Session,
) -> Optional[Suggestion]:
    """
    Main entry point called by sessions router after every session save.

    Flow:
    1. Check if score crosses 50 or 70
    2. Check if a suggestion was already generated recently for this user
       (avoid spamming suggestions every 30 seconds)
    3. Build prompt with session context + history
    4. Call Ollama (Mistral) API — local, no API key needed
    5. Save suggestion to MongoDB
    6. Return suggestion (or None if threshold not crossed)
    """

    score = session.fatigue_score

    # Step 1 — Check threshold
    if score < 50:
        return None

    status    = _get_status(score)
    threshold = _get_threshold(score)

    # Step 2 — Cooldown: don't generate a suggestion if one was already
    # generated for this user in the last 10 minutes
    ten_minutes_ago = datetime.now(timezone.utc) - timedelta(minutes=10)
    recent_suggestion = await Suggestion.find_one(
        Suggestion.user_id == session.user_id,
        Suggestion.timestamp >= ten_minutes_ago,
    )
    if recent_suggestion:
        return None  # cooldown active — skip

    # Step 3 — Get session history for context
    history = await _get_session_history(session.user_id)

    # Step 4 — Build prompt and call Ollama (Mistral)
    prompt = _build_prompt(session, history, status, threshold)
    try:
        suggestion_text = await _call_ollama(prompt)
    except Exception as e:
        # Don't crash the session save — just skip the suggestion
        print(f"[Suggestion] Ollama call failed: {e}")
        return None

    # Step 5 — Save to MongoDB
    suggestion = Suggestion(
        user_id        = session.user_id,
        session_id     = str(session.id),
        threshold      = threshold,
        status         = status,
        suggestion_text= suggestion_text,
        site_url       = session.site_url,
        fatigue_score  = score,
    )
    await suggestion.insert()

    return suggestion