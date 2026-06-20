from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.core.config import settings
from app.models.models import User, Session, Suggestion, UserSettings, OllamaChat, TaskAnchor, TaskDriftEvent, BlocklistRule, MemoryNote


async def init_db():
    """
    Called once at app startup (via FastAPI lifespan).
    Uses beanie 2.x API: pass the Motor client, not the database object.
    """
    import certifi
    client = AsyncIOMotorClient(
        settings.MONGO_URL,
        tls=True,
        tlsCAFile=certifi.where(),
    )

    await init_beanie(
        database=client[settings.MONGO_DB_NAME],
        document_models=[
            User,
            Session,
            Suggestion,
            UserSettings,
            OllamaChat,
            TaskAnchor,
            TaskDriftEvent,
            BlocklistRule,
            MemoryNote,
        ],
    )

    print(f"[DB] Connected to MongoDB — database: '{settings.MONGO_DB_NAME}'")