from app.routers.users import get_current_user
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.models.models import TaskAnchor, TaskDriftEvent, User

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    task_name: str

class DriftEventCreate(BaseModel):
    task_anchor_id: str
    task_name: str
    site_url: str
    page_title: str
    action_taken: str

@router.post("/anchor", status_code=201)
async def start_task_anchor(
    payload: TaskCreate,
    x_user_id: str = Depends(get_current_user)
):
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Complete any existing active tasks for this user
    active_tasks = await TaskAnchor.find(
        TaskAnchor.user_id == x_user_id,
        TaskAnchor.status == "active"
    ).to_list()
    
    for t in active_tasks:
        t.status = "completed"
        t.end_time = datetime.now(timezone.utc)
        await t.save()

    task = TaskAnchor(
        user_id=x_user_id,
        task_name=payload.task_name,
        status="active"
    )
    await task.insert()
    return {"task_anchor_id": str(task.id), "status": "success"}

@router.post("/anchor/{task_id}/complete")
async def complete_task_anchor(
    task_id: str,
    x_user_id: str = Depends(get_current_user)
):
    task = await TaskAnchor.get(task_id)
    if not task or task.user_id != x_user_id:
        raise HTTPException(status_code=404, detail="Task not found")
        
    task.status = "completed"
    task.end_time = datetime.now(timezone.utc)
    await task.save()
    return {"status": "success"}

@router.post("/drift", status_code=201)
async def log_drift_event(
    payload: DriftEventCreate,
    x_user_id: str = Depends(get_current_user)
):
    drift = TaskDriftEvent(
        user_id=x_user_id,
        task_anchor_id=payload.task_anchor_id,
        task_name=payload.task_name,
        site_url=payload.site_url,
        page_title=payload.page_title,
        action_taken=payload.action_taken
    )
    await drift.insert()
    return {"status": "success"}
