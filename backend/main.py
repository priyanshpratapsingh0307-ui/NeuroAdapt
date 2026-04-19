from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.database import init_db
from app.routers import users, sessions, dashboard, settings as settings_router, suggestions


# ─── LIFESPAN ─────────────────────────────────────────────
# Runs init_db() once on startup — connects Motor to MongoDB
# and initialises Beanie with all document models.
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    # (add cleanup here if needed later)


# ─── APP ──────────────────────────────────────────────────
app = FastAPI(
    title       = "NeuroAdapt API",
    description = "Backend for the NeuroAdapt cognitive fatigue Chrome extension.",
    version     = "1.0.0",
    lifespan    = lifespan,
    docs_url    = "/docs",      # Swagger UI at http://localhost:8000/docs
    redoc_url   = "/redoc",
)


# ─── CORS ─────────────────────────────────────────────────
# Allows the Chrome extension and the dashboard HTML file to
# call this backend. Add your extension origin to CORS_ORIGINS in .env.
# Chrome extension origin format: chrome-extension://<extension-id>
app.add_middleware(
    CORSMiddleware,
    allow_origins    = settings.get_cors_origins(),
    allow_credentials= True,
    allow_methods    = ["*"],
    allow_headers    = ["*"],
)


# ─── ROUTERS ──────────────────────────────────────────────
app.include_router(users.router)
app.include_router(sessions.router)
app.include_router(dashboard.router)
app.include_router(settings_router.router)
app.include_router(suggestions.router)


# ─── HEALTH CHECK ─────────────────────────────────────────
@app.get("/", tags=["health"])
async def root():
    return {
        "status" : "ok",
        "app"    : "NeuroAdapt API",
        "version": "1.0.0",
        "docs"   : "/docs",
    }


# ─── RUN ──────────────────────────────────────────────────
# To start the server:
#   uvicorn main:app --reload
#
# Then open: http://localhost:8000/docs
# You'll see all endpoints with auto-generated Swagger UI.