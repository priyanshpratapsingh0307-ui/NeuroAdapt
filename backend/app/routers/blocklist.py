from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

from app.models.models import BlocklistRule, User

router = APIRouter(prefix="/api/blocklist", tags=["blocklist"])

class BlocklistRuleCreate(BaseModel):
    domain: str
    mode: str
    threshold: Optional[float] = None
    avg_score_increase: Optional[float] = None

class BlocklistRuleResponse(BaseModel):
    id: str
    domain: str
    mode: str
    threshold: Optional[float] = None
    avg_score_increase: Optional[float] = None

@router.get("/", response_model=List[BlocklistRuleResponse])
async def get_blocklist(x_user_id: str = Header(...)):
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    rules = await BlocklistRule.find(BlocklistRule.user_id == x_user_id).to_list()
    return [
        BlocklistRuleResponse(
            id=str(r.id),
            domain=r.domain,
            mode=r.mode,
            threshold=r.threshold,
            avg_score_increase=r.avg_score_increase
        ) for r in rules
    ]

@router.post("/", response_model=BlocklistRuleResponse)
async def create_blocklist_rule(
    payload: BlocklistRuleCreate,
    x_user_id: str = Header(...)
):
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check if exists
    existing = await BlocklistRule.find_one(
        BlocklistRule.user_id == x_user_id,
        BlocklistRule.domain == payload.domain
    )
    if existing:
        existing.mode = payload.mode
        existing.threshold = payload.threshold
        existing.avg_score_increase = payload.avg_score_increase
        await existing.save()
        return BlocklistRuleResponse(
            id=str(existing.id),
            domain=existing.domain,
            mode=existing.mode,
            threshold=existing.threshold,
            avg_score_increase=existing.avg_score_increase
        )

    rule = BlocklistRule(
        user_id=x_user_id,
        domain=payload.domain,
        mode=payload.mode,
        threshold=payload.threshold,
        avg_score_increase=payload.avg_score_increase
    )
    await rule.insert()
    
    return BlocklistRuleResponse(
        id=str(rule.id),
        domain=rule.domain,
        mode=rule.mode,
        threshold=rule.threshold,
        avg_score_increase=rule.avg_score_increase
    )

@router.get("/suggestions")
async def get_blocklist_suggestions(x_user_id: str = Header(...)):
    """
    Mock endpoint for demonstration purposes. In a real scenario, this would
    analyze Session data to find domains with highest post-visit fatigue spikes.
    """
    # Just returning a few hardcoded suggestions for demo
    return [
        { "domain": "amazon.com", "avg_score_increase": 21 },
        { "domain": "tiktok.com", "avg_score_increase": 15 }
    ]
