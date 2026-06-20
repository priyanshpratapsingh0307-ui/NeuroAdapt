from app.routers.users import get_current_user
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from app.models.models import BlocklistRule, User, Session

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
async def get_blocklist(x_user_id: str = Depends(get_current_user)):
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
    x_user_id: str = Depends(get_current_user)
):
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check if exists — update if so
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

@router.delete("/{rule_id}", status_code=204)
async def delete_blocklist_rule(
    rule_id: str,
    x_user_id: str = Depends(get_current_user)
):
    """Remove a blocklist rule. Only allowed if it belongs to this user."""
    rule = await BlocklistRule.get(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.user_id != x_user_id:
        raise HTTPException(status_code=403, detail="Not your rule")
    await rule.delete()
    return

@router.get("/suggestions")
async def get_blocklist_suggestions(x_user_id: str = Depends(get_current_user)):
    """
    Analyses the last 30 days of sessions and surfaces the top 5 domains
    with the highest average fatigue score that are NOT already blocked.
    """
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    since = datetime.now(timezone.utc) - timedelta(days=30)
    sessions = await Session.find(
        Session.user_id == x_user_id,
        Session.timestamp >= since
    ).to_list()

    if not sessions:
        return []

    # Aggregate average fatigue score per domain
    domain_scores: dict[str, list[float]] = defaultdict(list)
    for s in sessions:
        if s.site_url:
            # Normalise to bare domain (strip scheme + path)
            domain = s.site_url.split("//")[-1].split("/")[0].lstrip("www.")
            domain_scores[domain].append(s.fatigue_score)

    # Compute averages, keep only domains with ≥ 2 sessions
    averages = {
        domain: sum(scores) / len(scores)
        for domain, scores in domain_scores.items()
        if len(scores) >= 2
    }

    # Fetch already-blocked domains so we don't suggest them again
    existing_rules = await BlocklistRule.find(BlocklistRule.user_id == x_user_id).to_list()
    blocked_domains = {r.domain.lstrip("www.") for r in existing_rules}

    # Sort descending by average score, exclude already-blocked, take top 5
    suggestions = sorted(
        [
            {"domain": domain, "avg_score_impact": round(avg, 1), "session_count": len(domain_scores[domain])}
            for domain, avg in averages.items()
            if domain not in blocked_domains and avg >= 45
        ],
        key=lambda x: x["avg_score_impact"],
        reverse=True
    )[:5]

    return suggestions
