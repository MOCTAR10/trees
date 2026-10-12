"""Species catalogue: reference profiles from the local registry (read-only)."""

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_current_user
from app.core.species_data import SPECIES_DB, resolve_species

router = APIRouter()


def _summary(profile) -> dict:
    data = asdict(profile)
    return {
        "scientific_name": data["scientific_name"],
        "common_name_fr": data["common_name_fr"],
        "family": data["family"],
        "wood_density_g_cm3": data["wood_density_g_cm3"],
        "iucn_status": data["iucn_status"],
        "cites_appendix": data["cites_appendix"],
        "eu_listing": data["eu_listing"],
        "native_to_africa": data["native_to_africa"],
        "aliases": list(data["aliases"]),
        "countries": list(data["countries"]),
        "type": data["type"],
    }


@router.get("")
async def list_species(
    q: str | None = Query(None, description="Filtre sur le nom commun ou scientifique"),
    limit: int = Query(5000, ge=1, le=5000),
    _user: dict = Depends(get_current_user),
):
    needle = (q or "").strip().lower()
    profiles = [
        p
        for p in SPECIES_DB.values()
        if not needle or needle in p.scientific_name.lower() or needle in p.common_name_fr.lower()
    ]
    profiles.sort(key=lambda p: (p.common_name_fr or p.scientific_name).lower())
    return {"count": len(profiles), "species": [_summary(p) for p in profiles[:limit]]}


@router.get("/{name}")
async def species_detail(name: str, _user: dict = Depends(get_current_user)):
    profile = resolve_species(name)
    if profile is None:
        raise HTTPException(status_code=404, detail="Espèce introuvable")
    return asdict(profile)
