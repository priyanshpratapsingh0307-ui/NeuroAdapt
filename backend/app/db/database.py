from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.core.config import settings
from app.models.models import User, Session, Suggestion, UserSettings


async def init_db():
    """
    Called once at app startup (via FastAPI lifespan).
    1. Creates an async Motor client connected to MongoDB.
    2. Initialises Beanie with all document models.
       Beanie will create collections automatically if they don't exist.
    """
    client = AsyncIOMotorClient(settings.MONGO_URL)
    database = client[settings.MONGO_DB_NAME]

    await init_beanie(
        database=database,
        document_models=[
            User,
            Session,
            Suggestion,
            UserSettings,
        ],
    )

    print(f"[DB] Connected to MongoDB — database: '{settings.MONGO_DB_NAME}'")