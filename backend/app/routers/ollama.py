from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Literal, Optional
from datetime import datetime, timezone

from app.services.gemini_service import generate_response

import httpx

from app.core.config import settings
from app.models.models import OllamaChat
from app.services.youtube_service import get_youtube_transcript, extract_video_id

router = APIRouter(prefix="/api/ollama", tags=["ollama"])

OLLAMA_CHAT_URL = f"{settings.OLLAMA_BASE_URL}/v1/chat/completions"


# ─── Request / Response schemas ───────────────────────────────────────────────

class OllamaChatRequest(BaseModel):
    """
    Sent by sidebar.js for both Chat and Focus-Mode classification.

    mode:
      "chat"     → free-form Q&A about the page
      "classify" → DOM element distraction classification (returns JSON array)

    page_title   : current tab title (optional, for context)
    page_text    : extracted page body text (truncated by extension to ~6 000 chars)
    user_message : the user's question, or a JSON-encoded elements list for "classify"
    """
    mode: Literal["chat", "classify", "summarise", "recommend"]
    page_title: Optional[str] = ""
    page_text: Optional[str] = ""
    user_message: str


class OllamaChatResponse(BaseModel):
    reply: str
    model: str
    timestamp: datetime


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _build_chat_prompt(req: OllamaChatRequest) -> str:
    if req.mode == "classify":
        return f"""You are a distraction classifier for a cognitive focus tool.
Analyze the following DOM elements in the context of the page: "{req.page_title or 'Unknown'}".

Classify each element as exactly one of:
- "highlight"      — SUPER IMPORTANT: The main thesis, a key data point, or a crucial conclusion. (Use sparingly)
- "essential"      — Main content: article body, primary headings, key images.
- "supplementary"  — Useful but secondary: author bio, breadcrumbs, related links.
- "distraction"    — Noise: ads, social bars, newsletters, cookie banners, comment sections, recommendations.

Return ONLY a JSON array. No prose, no markdown fences.
[{{"index":0,"classification":"highlight|essential|supplementary|distraction","reason":"1-3 words"}}]

PAGE CONTENT SUMMARY (for context):
{req.page_text[:1000]}

Elements to classify:
{req.user_message}"""

    if req.mode == "summarise":
        text = (req.page_text or '').strip()
        is_transcript = 'TRANSCRIPT:' in text

        if is_transcript:
            return f"""You are an expert video content analyst. A user is watching a YouTube video and needs a detailed summary.

VIDEO TITLE: {req.page_title or 'Unknown'}
{text[:15000]}

Provide a DETAILED summary of this video's content:
1. **Overview** — A 2-3 sentence high-level description of what this video covers.
2. **Key Topics Covered** — List every major topic or section discussed, with a brief explanation of each.
3. **Main Arguments / Takeaways** — What are the core points, conclusions, or advice given?
4. **Notable Details** — Any specific data, examples, tools, or resources mentioned.

Be thorough. The user wants to understand the full content without watching the entire video."""

        return f"""You are a helpful reading assistant. Summarise the following page clearly and concisely using bullet points.

PAGE TITLE: {req.page_title or 'Unknown'}
PAGE CONTENT:
{text[:12000]}

Give a bullet-point summary. Be concise — 5 bullets maximum."""

    if req.mode == "recommend":
        return f"""You are a cognitive health advisor for a person who may have ADHD or a short attention span.

Based on the following weekly fatigue data (daily average scores from 0-100, where higher = more fatigued/distracted), generate exactly 5 personalized, actionable improvement steps.

WEEKLY FATIGUE DATA:
{req.user_message}

RULES:
- Each step must be specific, practical, and immediately actionable (not generic advice).
- Tailor advice to the severity: low scores (0-30) = maintenance tips, medium (30-60) = active improvement, high (60-100) = urgent intervention.
- Include a mix of: behavioral changes, environmental adjustments, and cognitive exercises.
- Format each step as a JSON object with "title" (short, 3-5 words), "description" (1-2 sentences), and "priority" ("low", "medium", "high").

Return ONLY a JSON array of 5 objects. No prose, no markdown fences.
[{{"title":"...", "description":"...", "priority":"low|medium|high"}}]"""

    # chat
    if req.page_text:
        return f"""You are a helpful AI reading assistant.
STRICT RULE: You are a focus-aid. ONLY answer questions about the provided PAGE CONTENT.
If the user asks something unrelated, politely decline and steer them back to the page content to avoid distraction.

PAGE TITLE: {req.page_title or 'Unknown'}
PAGE CONTENT (truncated to 6000 chars):
{req.page_text.strip()[:6000]}

USER QUESTION:
{req.user_message}"""

    return f"You are a helpful assistant. ONLY answer regarding the current context. USER QUESTION: {req.user_message}"


async def _call_mistral(prompt: str) -> str:
    """
    Calls Ollama's OpenAI-compatible endpoint with the mistral model.
    Raises HTTPException on any failure so FastAPI returns a clean 502.
    """
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                OLLAMA_CHAT_URL,
                json={
                    "model": settings.OLLAMA_MODEL,
                    "stream": False,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["choices"][0]["message"]["content"]
            return text.strip()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=502,
            detail="Cannot reach Ollama. Make sure it's running: `ollama serve`",
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Ollama timed out. Try a shorter input.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Ollama error: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)[:200]}")


# ─── Route ────────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=OllamaChatResponse)
async def ollama_chat(
    payload: OllamaChatRequest,
    x_user_id: str = Header(...),
):
    """
    Unified AI endpoint called by the extension for:
      - Chat:      mode="chat",     user_message = user's question
      - Summarise: mode="summarise" (pre-built prompt on page text)
      - Classify:  mode="classify", user_message = JSON of DOM elements

    The response is also stored in MongoDB (OllamaChat collection) so it
    can be surfaced in the dashboard's history panel later.
    """
    # SPECIAL HANDLING FOR YOUTUBE
    is_youtube = "youtube.com/watch" in payload.page_text or "youtu.be/" in payload.page_text
    
    if payload.mode == "summarise" and is_youtube:
        print(f"[Ollama] YouTube detected. Attempting to fetch transcript...")
        transcript = await get_youtube_transcript(payload.page_text)
        if transcript:
            payload.page_text = f"TITLE: {payload.page_title}\nURL: {payload.page_text}\nTRANSCRIPT:\n{transcript[:15000]}"
            print(f"[Ollama] Transcript fetched ({len(transcript)} chars). Summarizing transcript.")
        else:
            print(f"[Ollama] No transcript found. Summarizing metadata only.")

    # prompt = _build_chat_prompt(payload)
    # reply  = await _call_mistral(prompt)

    prompt = _build_chat_prompt(payload)
    reply = await generate_response(prompt)

    now = datetime.now(timezone.utc)

    # Persist to MongoDB (optional — chat works even if DB is unavailable)
    try:
        record = OllamaChat(
            user_id=x_user_id,
            mode=payload.mode,
            page_title=payload.page_title or "",
            user_message=payload.user_message[:500],
            reply=reply,
            model=settings.GEMINI_MODEL,
        )
        await record.insert()
        now = record.timestamp
    except Exception as db_err:
        print(f"[Ollama] DB persist skipped (MongoDB unavailable): {db_err}")

    return OllamaChatResponse(
        reply=reply,
        model=settings.GEMINI_MODEL,
        timestamp=now,
    )
