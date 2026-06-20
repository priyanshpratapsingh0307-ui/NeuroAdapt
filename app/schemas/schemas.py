from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ─── USER ─────────────────────────────────────────────────

class UserRegister(BaseModel):
    """
    Sent by extension on first install.
    Extension generates user_id (UUID) itself and sends it here.
    """
    user_id: str
    name: str


class UserResponse(BaseModel):
    user_id: str
    name: str
    created_at: datetime


# ─── SESSION ──────────────────────────────────────────────

class SessionCreate(BaseModel):
    """
    Sent by content_script.js every ~30 seconds.
    All raw signals + the calculated fatigue score.
    """
    fatigue_score: float       # 0–100
    wpm: float                 # typing speed
    error_rate: float          # errors per minute
    scroll_rate: float         # pages per minute
    click_delay: float         # ms average
    rage_clicks: int           # count
    site_url: str              # current tab URL
    duration_mins: float       # how long this session has been active


class SessionResponse(BaseModel):
    id: str
    user_id: str
    fatigue_score: float
    wpm: float
    error_rate: float
    scroll_rate: float
    click_delay: float
    rage_clicks: int
    site_url: str
    duration_mins: float
    timestamp: datetime

    # Suggestion triggered by this session (if any)
    suggestion: Optional[str] = None
    threshold_crossed: Optional[int] = None   # 50 or 70


# ─── SUGGESTION ───────────────────────────────────────────

class SuggestionResponse(BaseModel):
    id: str
    user_id: str
    session_id: str
    threshold: int             # 50 or 70
    status: str                # "fragile" or "strained"
    suggestion_text: str
    site_url: str
    fatigue_score: float
    timestamp: datetime


# ─── DASHBOARD ────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    name: str


class DashboardResponse(BaseModel):
    """
    Everything the dashboard needs in one call.
    Feeds all the charts and stat cards.
    """
    user_name: str
    current_score: float
    current_status: str        # "healthy" | "fragile" | "strained"
    total_sessions: int
    avg_score_7d: float        # average over last 7 days
    worst_site: Optional[str]  # site with highest avg fatigue
    trend: list                # list of {timestamp, score} for the line chart
    wpm_trend: list            # granular typing trend
    error_trend: list          # granular error trend
    scroll_trend: list         # granular scroll trend
    latest_suggestion: Optional[str]


# ─── SETTINGS ─────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    typing_weight: Optional[int] = None
    scroll_weight: Optional[int] = None
    fragile_threshold: Optional[int] = None
    strained_threshold: Optional[int] = None
    focus_mode_enabled: Optional[bool] = None
    break_reminders: Optional[bool] = None
    strained_alerts: Optional[bool] = None
    ui_simplification: Optional[bool] = None
    store_history: Optional[bool] = None
    high_contrast: Optional[bool] = None
    larger_targets: Optional[bool] = None


class SettingsResponse(BaseModel):
    user_id: str
    typing_weight: int
    scroll_weight: int
    fragile_threshold: int
    strained_threshold: int
    focus_mode_enabled: bool
    break_reminders: bool
    strained_alerts: bool
    ui_simplification: bool
    store_history: bool
    high_contrast: bool
    larger_targets: bool
    updated_at: datetime