from google import genai
from app.core.config import settings

client = genai.Client(
    api_key=settings.GEMINI_API_KEY
)

async def generate_response(prompt: str) -> str:
    response = await client.aio.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt
    )

    return response.text.strip()