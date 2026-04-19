from fastapi import APIRouter, HTTPException, Header
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from app.models.models import Session, User, Suggestion
from app.schemas.schemas import DashboardResponse

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/", response_model=DashboardResponse)
async def get_dashboard(x_user_id: str = Header(...)):
    """
    Returns everything the dashboard needs in a single call.

    Feeds:
    - The fatigue score ring + status badge (current_score, current_status)
    - The 30-day trend line chart (trend)
    - The stat cards (avg_score_7d, total_sessions, worst_site)
    - The latest AI suggestion panel (latest_suggestion)
    """

    # Verify user
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    now    = datetime.now(timezone.utc)
    day7   = now - timedelta(days=7)
    day30  = now - timedelta(days=30)

    # All sessions in last 30 days (for trend chart)
    sessions_30d = (
        await Session.find(
            Session.user_id  == x_user_id,
            Session.timestamp >= day30,
        )
        .sort(Session.timestamp)
        .to_list()
    )

    # Sessions in last 7 days (for avg + worst site)
    sessions_7d = [s for s in sessions_30d if s.timestamp >= day7]

    # Current score = most recent session score (or 0 if none)
    current_score = sessions_30d[-1].fatigue_score if sessions_30d else 0.0

    # Average score over last 7 days
    avg_score_7d = (
        round(sum(s.fatigue_score for s in sessions_7d) / len(sessions_7d), 1)
        if sessions_7d else 0.0
    )

    # Worst site = site with highest average fatigue score
    site_scores: dict[str, list[float]] = defaultdict(list)
    for s in sessions_7d:
        site_scores[s.site_url].append(s.fatigue_score)

    worst_site = None
    if site_scores:
        worst_site = max(
            site_scores,
            key=lambda site: sum(site_scores[site]) / len(site_scores[site])
        )

    # Trend data — one point per session (timestamp + score)
    trend = [
        {
            "timestamp": s.timestamp.isoformat(),
            "score"    : s.fatigue_score,
            "site"     : s.site_url,
        }
        for s in sessions_30d
    ]

    # Latest suggestion
    latest_suggestion_doc = (
        await Suggestion.find(Suggestion.user_id == x_user_id)
        .sort(-Suggestion.timestamp)
        .limit(1)
        .first_or_none()
    )
    latest_suggestion = (
        latest_suggestion_doc.suggestion_text if latest_suggestion_doc else None
    )

    # Current status
    def get_status(score: float) -> str:
        if score >= 70: return "strained"
        if score >= 50: return "fragile"
        return "healthy"

    return DashboardResponse(
        user_name        = user.name,
        current_score    = current_score,
        current_status   = get_status(current_score),
        total_sessions   = len(sessions_30d),
        avg_score_7d     = avg_score_7d,
        worst_site       = worst_site,
        trend            = trend,
        latest_suggestion= latest_suggestion,
    )