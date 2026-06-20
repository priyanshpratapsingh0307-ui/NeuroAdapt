from fastapi import APIRouter, HTTPException, Header, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import uuid

from app.models.models import User
from app.schemas.schemas import UserRegister, UserResponse, UserCreate, UserLogin, Token
from app.core.security import get_password_hash, verify_password, create_access_token, decode_access_token

router = APIRouter(prefix="/api/users", tags=["users"])
security = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_user_id: Optional[str] = Header(None)
) -> str:
    """
    Extracts user_id either from Bearer token (web dashboard) or x-user-id header (extension legacy).
    """
    if credentials:
        payload = decode_access_token(credentials.credentials)
        if payload and "sub" in payload:
            return payload["sub"]
    
    if x_user_id:
        return x_user_id
        
    raise HTTPException(status_code=401, detail="Not authenticated")

@router.post("/signup", response_model=Token, status_code=201)
async def signup(payload: UserCreate):
    existing_user = await User.find_one({"email": payload.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    new_user_id = str(uuid.uuid4())
    user = User(
        user_id=new_user_id,
        name=payload.name,
        email=payload.email,
        hashed_password=get_password_hash(payload.password)
    )
    await user.insert()
    
    access_token = create_access_token(data={"sub": user.user_id})
    return {"access_token": access_token, "token_type": "bearer", "user_id": user.user_id, "name": user.name}

@router.post("/login", response_model=Token)
async def login(payload: UserLogin):
    user = await User.find_one({"email": payload.email})
    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    access_token = create_access_token(data={"sub": user.user_id})
    return {"access_token": access_token, "token_type": "bearer", "user_id": user.user_id, "name": user.name}

@router.post("/register", response_model=UserResponse, status_code=201)
async def register_user(payload: UserRegister):
    existing = await User.find_one({"user_id": payload.user_id})
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
async def get_me(user_id: str = Depends(get_current_user)):
    user = await User.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        user_id    = user.user_id,
        name       = user.name,
        created_at = user.created_at,
    )

@router.delete("/", status_code=204)
async def delete_user_data(user_id: str = Depends(get_current_user)):
    from app.models.models import Session, Suggestion, UserSettings, OllamaChat
    
    user = await User.find_one({"user_id": user_id})
    if user:
        await user.delete()
    
    await Session.find({"user_id": user_id}).delete()
    await Suggestion.find({"user_id": user_id}).delete()
    await UserSettings.find({"user_id": user_id}).delete()
    await OllamaChat.find({"user_id": user_id}).delete()
    
    return