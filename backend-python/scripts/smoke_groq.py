import asyncio

from app.services import groq_llm


async def main() -> None:
    out = await groq_llm.chat_json(
        "Tu réponds uniquement en JSON valide.",
        'Retourne exactement: {"model": "ton identifiant", "greeting_fr": "bonjour en francais"}',
        max_tokens=256,
    )
    print("Groq JSON:", out)


asyncio.run(main())
