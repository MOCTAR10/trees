import asyncio
import time

import httpx


async def main() -> None:
    payload = {
        "species_scientific_name": "Aucoumea klaineana",
        "measured_dbh_cm": 62.5,
        "latitude": 0.4162,
        "longitude": 9.4541,
    }
    async with httpx.AsyncClient(timeout=300.0) as client:
        t0 = time.perf_counter()
        r = await client.post("http://localhost:3000/api/v2/process-scan", json=payload)
        dt = time.perf_counter() - t0
        print(f"status={r.status_code} in {dt:.1f}s")
        if r.status_code != 200:
            print(r.text[:500])
            return
        data = r.json()
        plan = data["valorization_plan"]
        print("waste kg:", data["residue_engine"]["total_waste_biomass_kg"])
        print("analysis:", plan["analysis_summary"])
        print("carbon:", plan["carbon_offset_metadata"])
        print(
            "branches:", plan["residue_breakdown"]["canopy_and_branches"]["primary_recommendation"]
        )
        print("bark:", plan["residue_breakdown"]["bark_and_organic_liquids"]["industrial_use_case"])
        print("impact:", plan["win_win_synergy_plan"]["community_impact_plan"])
        print("coops:", data["matched_cooperatives"][:3])


asyncio.run(main())
