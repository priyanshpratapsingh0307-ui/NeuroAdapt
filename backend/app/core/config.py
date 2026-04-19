from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # MongoDB
    MONGO_URL: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "neuroadapt"

    # Ollama (local LLM)
    OLLAMA_MODEL: str = "mistral"         # model pulled via `ollama pull mistral`
    OLLAMA_BASE_URL: str = "http://localhost:11434"

    # CORS — comma-separated list of allowed origins
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:5500"

    # App
    APP_ENV: str = "development"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def get_cors_origins(self) -> List[str]:
        """
        Returns CORS_ORIGINS as a list.
        e.g. "http://localhost:3000,http://127.0.0.1:5500"
             → ["http://localhost:3000", "http://127.0.0.1:5500"]
        """
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


# Single instance used across the whole app
settings = Settings()