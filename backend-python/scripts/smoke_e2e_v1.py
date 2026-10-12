"""End-to-end v1 smoke: multi-view scan (orbit + organs) through the Node gateway."""

import asyncio
import time

import httpx

PHOTO_URL = "https://inaturalist-open-data.s3.amazonaws.com/photos/701574190/large.jpg"


async def main() -> None:
    async with httpx.AsyncClient(timeout=280.0, follow_redirects=True) as client:
        img = (await client.get(PHOTO_URL)).content
        print(f"photo: {len(img)} bytes")

        files = [
            ("images", ("whole_0.jpg", img, "image/jpeg")),
            ("images", ("bark_1.jpg", img, "image/jpeg")),
            ("images", ("leaf_top.jpg", img, "image/jpeg")),
            ("images", ("leaf_under.jpg", img, "image/jpeg")),
            ("organs", (None, "whole")),
            ("organs", (None, "bark")),
            ("organs", (None, "leaf")),
            ("organs", (None, "leaf")),
            ("azimuths", (None, "0")),
            ("azimuths", (None, "-1")),
            ("azimuths", (None, "-1")),
            ("azimuths", (None, "-1")),
            ("latitude", (None, "0.4162")),
            ("longitude", (None, "9.4541")),
            ("ar_depth_m", (None, "1.30")),
            ("focal_px", (None, "2200")),
        ]
        t0 = time.perf_counter()
        r = await client.post("http://localhost:3000/api/v1/process-scan", files=files)
        dt = time.perf_counter() - t0
        print(f"status={r.status_code} in {dt:.1f}s")
        if r.status_code != 200:
            print(r.text[:600])
            return
        body = r.json()
        for key in (
            "species_scientific_name",
            "species_common_name_fr",
            "measured_dbh_cm",
            "dbh_method",
            "estimated_height_m",
            "estimated_age_years",
            "health_status",
            "soil_type",
            "canopy_density_fcd",
        ):
            print(f"  {key}: {body.get(key)}")
        narrative = body.get("narrative_fr") or ""
        print(f"  narrative: {narrative[:180].encode('ascii', 'replace').decode()}...")


asyncio.run(main())
