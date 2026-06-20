from app.routers.users import get_current_user
from fastapi import APIRouter, HTTPException, Header, Query, Depends
from typing import List
from datetime import datetime, timezone, timedelta

from app.models.models import Suggestion, User
from app.schemas.schemas import SuggestionResponse

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])


@router.get("/latest")
async def get_latest_suggestion(x_user_id: str = Depends(get_current_user)):
    """
    Returns the most recent suggestion for this user.

    Called by:
    - The extension popup to show the latest AI tip
    - The dashboard's "Latest Suggestion" panel
    """
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    suggestion = (
        await Suggestion.find(Suggestion.user_id == x_user_id)
        .sort(-Suggestion.timestamp)
        .limit(1)
        .first_or_none()
    )

    if not suggestion:
        return {"suggestion": None, "message": "No suggestions yet."}

    return _to_response(suggestion)


@router.get("/", response_model=List[SuggestionResponse])
async def get_suggestions(
    x_user_id: str = Depends(get_current_user),
    limit: int = Query(default=20, le=100),
    days: int  = Query(default=7, le=30),
):
    """
    Returns suggestion history for the dashboard history page.
    Default: last 7 days, up to 20 suggestions.
    """
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    since = datetime.now(timezone.utc) - timedelta(days=days)

    suggestions = (
        await Suggestion.find(
            Suggestion.user_id  == x_user_id,
            Suggestion.timestamp >= since,
        )
        .sort(-Suggestion.timestamp)
        .limit(limit)
        .to_list()
    )

    return [_to_response(s) for s in suggestions]


def _to_response(s: Suggestion) -> SuggestionResponse:
    return SuggestionResponse(
        id              = str(s.id),
        user_id         = s.user_id,
        session_id      = s.session_id,
        threshold       = s.threshold,
        status          = s.status,
        suggestion_text = s.suggestion_text,
        site_url        = s.site_url,
        fatigue_score   = s.fatigue_score,
        timestamp       = s.timestamp,
    )