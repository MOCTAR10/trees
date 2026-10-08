"""Groq chat-completions client (structured JSON generation).

Default model: openai/gpt-oss-120b (GROQ_MODEL env override). The model id
is configuration, never hard-pinned — Groq has retired the Llama 3.x
versatile ids.
"""

import json

import httpx

from app.config import get_settings


async def chat_json(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> dict:
    """Call Groq with JSON response format; return the parsed object."""
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{settings.groq_base_url}/chat/completions",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)


async def chat_text(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.4,
    max_tokens: int = 2048,
) -> str:
    """Free-text completion (French user-facing narratives)."""
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{settings.groq_base_url}/chat/completions",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]
