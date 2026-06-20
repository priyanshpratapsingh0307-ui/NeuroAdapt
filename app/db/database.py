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
    
    # Only use TLS for MongoDB Atlas (mongodb+srv://)
    is_atlas = settings.MONGO_URL.startswith("mongodb+srv")
    
    if is_atlas:
        client = AsyncIOMotorClient(
            settings.MONGO_URL,
            tls=True,
            tlsCAFile=certifi.where(),
        )
    else:
        client = AsyncIOMotorClient(
            settings.MONGO_URL
        )

    print("Beanie initializing")

    document_models = [
        User,
        Session,
        Suggestion,
        UserSettings,
        OllamaChat,
        TaskAnchor,
        TaskDriftEvent,
        BlocklistRule,
        MemoryNote,
    ]

    try:
        await init_beanie(
            database=client[settings.MONGO_DB_NAME],
            document_models=document_models,
        )
        print("Beanie initialized")
        print(f"[DB] Connected to MongoDB — database: '{settings.MONGO_DB_NAME}'")
    except Exception as e:
        print(f"[DB] WARNING: MongoDB connection failed — {e}")
        print("[DB] Falling back to in-memory mongomock-motor database. Persistence will be lost on restart.")
        
        from mongomock_motor import AsyncMongoMockClient
        mock_client = AsyncMongoMockClient()
        
        await init_beanie(
            database=mock_client[settings.MONGO_DB_NAME],
            document_models=document_models,
        )
        print("Beanie initialized with mock DB")
        print("[DB] Initialized in-memory mock database successfully.")
