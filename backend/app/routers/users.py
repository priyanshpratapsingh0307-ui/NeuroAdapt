from fastapi import APIRouter, HTTPException, Header
from typing import Optional

from app.models.models import User
from app.schemas.schemas import UserRegister, UserResponse

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register_user(payload: UserRegister):
    """
    Called ONCE when the Chrome extension is installed for the first time.

    Extension generates a UUID via crypto.randomUUID() and stores it in
    chrome.storage.local. It then calls this endpoint with that UUID + name.

    If the user_id already exists (e.g. extension reinstalled), we return
    the existing user instead of creating a duplicate.
    """
    existing = await User.find_one(User.user_id == payload.user_id)
    if existing:
        return UserResponse(
            user_id    = existing.user_id,
            name       = existing.name,
            created_at = existing.created_at,
        )

    user = User(user_id=payload.user_id, name=payload.name)
    await user.insert()

    return UserResponse(
        user_id    = user.user_id,
        name       = user.name,
        created_at = user.created_at,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(x_user_id: str = Header(...)):
    """
    Returns the current user's profile.
    Extension sends X-User-ID header with every request.
    """
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Register first.")

    return UserResponse(
        user_id    = user.user_id,
        name       = user.name,
        created_at = user.created_at,
    )