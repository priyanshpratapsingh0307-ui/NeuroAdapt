from app.models.models import Suggestion


def format_push_payload(suggestion: Suggestion) -> dict:
    """
    Formats a Suggestion into a browser push notification payload.

    The extension's background.js receives this and calls:
        chrome.notifications.create({ ... })

    Payload fields map directly to Chrome Notification API options.
    """

    # Title changes based on severity
    if suggestion.status == "strained":
        title = "⚠️ NeuroAdapt — You're Strained"
        icon  = "strained"        # extension uses this to pick icon colour
    else:
        title = "💛 NeuroAdapt — Heads Up"
        icon  = "fragile"

    # Body is a short excerpt of Claude's suggestion (first 100 chars)
    # The full text is shown in the popup when user clicks the notification
    body_preview = suggestion.suggestion_text[:120]
    if len(suggestion.suggestion_text) > 120:
        body_preview += "…"

    return {
        "title"          : title,
        "body"           : body_preview,
        "full_text"      : suggestion.suggestion_text,   # full text for popup
        "icon"           : icon,
        "score"          : suggestion.fatigue_score,
        "status"         : suggestion.status,
        "threshold"      : suggestion.threshold,
        "site_url"       : suggestion.site_url,
        "suggestion_id"  : str(suggestion.id),
        "timestamp"      : suggestion.timestamp.isoformat(),
    }