import asyncio
import sys

import httpx

from app.services import plantnet


async def main() -> None:
    # Find a CC-licensed Aucoumea klaineana photo via iNaturalist open data
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(
            "https://api.inaturalist.org/v1/observations",
            params={
                "taxon_name": "Aucoumea klaineana",
                "photos": "true",
                "quality_grade": "research",
                "per_page": 5,
            },
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        image_url = None
        for obs in results:
            photos = obs.get("photos") or []
            if photos:
                url = photos[0].get("url", "")
                image_url = url.replace("/square.", "/large.")
                break
        if not image_url:
            print("no image found", file=sys.stderr)
            sys.exit(1)
        print("image:", image_url)
        img_resp = await client.get(image_url)
        img_resp.raise_for_status()
        image_bytes = img_resp.content
        print(f"downloaded {len(image_bytes)} bytes")

    result = await plantnet.identify(images=[image_bytes], organs=["auto"], lang="fr")
    print("Pl@ntNet top:", result.scientific_name, "score:", result.score, "gbif:", result.gbif_id)
    print("common:", result.common_names)


asyncio.run(main())
