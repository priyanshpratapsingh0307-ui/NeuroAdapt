from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional, List
from datetime import datetime, timezone, timedelta

from app.models.models import Session, User
from app.schemas.schemas import SessionCreate, SessionResponse
from app.services.suggestion_service import check_and_generate_suggestion
from app.services.notification_service import format_push_payload

# TODO Fix routing

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/", status_code=201)
async def save_session(
    payload: SessionCreate,
    x_user_id: str = Header(...),
):
    """
    Main endpoint — called by content_script.js every ~30 seconds.

    Flow:
    1. Verify user exists
    2. Save session to MongoDB
    3. Check if fatigue score crossed 50 or 70
    4. If yes → call Claude via suggestion_service
    5. Return session data + suggestion payload (if any)

    The extension's background.js reads the response and shows a
    chrome.notifications.create() if suggestion is present.
    """

    # Step 1 — Verify user
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not registered. Call POST /api/users/register first."
        )

    # Step 2 — Save session
    session = Session(
        user_id      = x_user_id,
        fatigue_score= payload.fatigue_score,
        wpm          = payload.wpm,
        error_rate   = payload.error_rate,
        scroll_rate  = payload.scroll_rate,
        click_delay  = payload.click_delay,
        rage_clicks  = payload.rage_clicks,
        site_url     = payload.site_url,
        duration_mins= payload.duration_mins,
    )
    await session.insert()

    # Step 3 & 4 — Check thresholds, generate suggestion if needed
    suggestion     = await check_and_generate_suggestion(session)
    push_payload   = format_push_payload(suggestion) if suggestion else None

    # Step 5 — Return
    return {
        "session_id"       : str(session.id),
        "fatigue_score"    : session.fatigue_score,
        "status"           : _get_status(session.fatigue_score),
        "timestamp"        : session.timestamp,
        "notification"     : push_payload,   # None if no threshold crossed
    }


@router.get("/", response_model=List[SessionResponse])
async def get_sessions(
    x_user_id: str = Header(...),
    limit: int = Query(default=50, le=200),
    days: int  = Query(default=7,  le=30),
):
    """
    Returns session history for the dashboard.
    Default: last 7 days, up to 50 sessions.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)

    sessions = (
        await Session.find(
            Session.user_id  == x_user_id,
            Session.timestamp >= since,
        )
        .sort(-Session.timestamp)
        .limit(limit)
        .to_list()
    )

    return [
        SessionResponse(
            id           = str(s.id),
            user_id      = s.user_id,
            fatigue_score= s.fatigue_score,
            wpm          = s.wpm,
            error_rate   = s.error_rate,
            scroll_rate  = s.scroll_rate,
            click_delay  = s.click_delay,
            rage_clicks  = s.rage_clicks,
            site_url     = s.site_url,
            duration_mins= s.duration_mins,
            timestamp    = s.timestamp,
        )
        for s in sessions
    ]


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    x_user_id: str = Header(...),
):
    """
    Deletes a single session. Only allowed if it belongs to this user.
    """
    session = await Session.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.user_id != x_user_id:
        raise HTTPException(status_code=403, detail="Not your session.")

    await session.delete()
    return


def _get_status(score: float) -> str:
    if score >= 70:
        return "strained"
    elif score >= 50:
        return "fragile"
    return "healthy"