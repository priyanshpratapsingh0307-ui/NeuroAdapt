from fastapi import APIRouter, HTTPException, Header
from datetime import datetime, timezone

from app.models.models import UserSettings, User
from app.schemas.schemas import SettingsUpdate, SettingsResponse

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/", response_model=SettingsResponse)
async def get_settings(x_user_id: str = Header(...)):
    """
    Returns saved settings for this user.
    If no settings document exists yet, returns the defaults.
    """
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    settings_doc = await UserSettings.find_one(
        UserSettings.user_id == x_user_id
    )

    # If user has never saved settings, return defaults
    if not settings_doc:
        settings_doc = UserSettings(user_id=x_user_id)
        await settings_doc.insert()

    return _to_response(settings_doc)


@router.put("/", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate,
    x_user_id: str = Header(...),
):
    """
    Saves updated settings from the dashboard settings page.
    Only updates fields that are provided — others stay unchanged.
    """
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    settings_doc = await UserSettings.find_one(
        UserSettings.user_id == x_user_id
    )

    # Create settings doc if it doesn't exist
    if not settings_doc:
        settings_doc = UserSettings(user_id=x_user_id)
        await settings_doc.insert()

    # Apply only the fields that were sent in the request
    update_data = payload.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(settings_doc, field, value)

    settings_doc.updated_at = datetime.now(timezone.utc)
    await settings_doc.save()

    return _to_response(settings_doc)


def _to_response(doc: UserSettings) -> SettingsResponse:
    return SettingsResponse(
        user_id             = doc.user_id,
        typing_weight       = doc.typing_weight,
        scroll_weight       = doc.scroll_weight,
        fragile_threshold   = doc.fragile_threshold,
        strained_threshold  = doc.strained_threshold,
        focus_mode_enabled  = doc.focus_mode_enabled,
        break_reminders     = doc.break_reminders,
        strained_alerts     = doc.strained_alerts,
        ui_simplification   = doc.ui_simplification,
        store_history       = doc.store_history,
        high_contrast       = doc.high_contrast,
        larger_targets      = doc.larger_targets,
        updated_at          = doc.updated_at,
    )