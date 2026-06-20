from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

from app.models.models import MemoryNote, User
from app.services.gemini_service import generate_response

router = APIRouter(prefix="/api/notes", tags=["notes"])

class NoteCreate(BaseModel):
    content: str
    note_type: str = "thought"
    url: Optional[str] = None
    domain: Optional[str] = None
    task_anchor_id: Optional[str] = None

class NoteResponse(BaseModel):
    id: str
    content: str
    note_type: str
    url: Optional[str] = None
    domain: Optional[str] = None
    task_anchor_id: Optional[str] = None
    timestamp: datetime

@router.get("/", response_model=List[NoteResponse])
async def get_notes(x_user_id: str = Header(...)):
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    notes = await MemoryNote.find(
        MemoryNote.user_id == x_user_id
    ).sort("-timestamp").to_list()
    
    return [
        NoteResponse(
            id=str(n.id),
            content=n.content,
            note_type=n.note_type,
            url=n.url,
            domain=n.domain,
            task_anchor_id=n.task_anchor_id,
            timestamp=n.timestamp
        ) for n in notes
    ]

@router.post("/", response_model=NoteResponse)
async def create_note(
    payload: NoteCreate,
    x_user_id: str = Header(...)
):
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    note = MemoryNote(
        user_id=x_user_id,
        content=payload.content,
        note_type=payload.note_type,
        url=payload.url,
        domain=payload.domain,
        task_anchor_id=payload.task_anchor_id
    )
    await note.insert()
    
    return NoteResponse(
        id=str(note.id),
        content=note.content,
        note_type=note.note_type,
        url=note.url,
        domain=note.domain,
        task_anchor_id=note.task_anchor_id,
        timestamp=note.timestamp
    )

@router.post("/organize")
async def organize_notes(x_user_id: str = Header(...)):
    user = await User.find_one(User.user_id == x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    notes = await MemoryNote.find(
        MemoryNote.user_id == x_user_id
    ).sort("-timestamp").to_list()
    
    if not notes:
        return {"summary": "No notes to organize."}
        
    # Group them into a text blob to send to Mistral/Gemini
    text_blob = ""
    for n in notes:
        text_blob += f"- [{n.note_type}] {n.content} (URL: {n.url})\n"
        
    prompt = f"Please organize these scattered thoughts and working memory fragments into a clean, structured summary with action items where applicable:\n\n{text_blob}"
    
    # We use gemini_service since Mistral was swapped to Gemini earlier
    reply = await generate_response(prompt)
    
    return {"summary": reply}
