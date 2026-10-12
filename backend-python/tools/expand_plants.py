"""Plant (biodiversity) cohort expansion — non-woody plants (``type="plante"``).

Adds plant species to the registry from GBIF (family + accepted name). Unlike
trees, plants carry no wood density / DBH / allometry — they enrich the
catalogue with family, genus, distribution and IUCN status only.

Usage::

    python -m tools.expand_plants --limit 300
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
PLANTS_OUT = DATA_DIR / "plants_reference.json"

GBIF_MATCH_URL = "https://api.gbif.org/v1/species/match"
GBIF_SEARCH_URL = "https://api.gbif.org/v1/species/search"
USER_AGENT = "forestry-app/0.1 (plants enrichment)"

# Non-woody plant families relevant to the Congo Basin (biodiversity cohort).
PLANT_FAMILIES = [
    "Orchidaceae",
    "Zingiberaceae",
    "Marantaceae",
    "Araceae",
    "Acanthaceae",
    "Asteraceae",
    "Poaceae",
    "Rubiaceae",
    "Begoniaceae",
    "Piperaceae",
]


def _http_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.load(resp)


def _family_key(name: str) -> int | None:
    try:
        data = _http_json(f"{GBIF_MATCH_URL}?name={urllib.parse.quote(name)}&rank=family")
    except Exception:
        return None
    return data.get("usageKey") or data.get("acceptedUsageKey")


def _species_in_family(key: int, family: str, limit: int) -> list[dict]:
    out: list[dict] = []
    for offset in range(0, limit, 300):
        url = f"{GBIF_SEARCH_URL}?highertaxon_key={key}&rank=species&limit=300&offset={offset}"
        data = _http_json(url)
        for r in data.get("results", []):
            name = r.get("species") or r.get("scientificName")
            if name:
                out.append({"scientific_name": name, "family": family})
        if data.get("endOfRecords"):
            break
    return out


def fetch(limit: int) -> list[dict]:
    entries: dict[str, dict] = {}
    for family in PLANT_FAMILIES:
        key = _family_key(family)
        if not key:
            print(f"skip {family} (no GBIF key)")
            continue
        try:
            species = _species_in_family(key, family, limit)
        except Exception as exc:  # noqa: BLE001 — keep going on transient failures
            print(f"{family} failed: {exc}", file=sys.stderr)
            continue
        for s in species:
            entries.setdefault(s["scientific_name"], s)
        print(f"{family}: +{len(species)}")
        time.sleep(0.3)
    return list(entries.values())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=300)
    args = parser.parse_args(argv)
    rows = fetch(args.limit)
    PLANTS_OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} plant species -> {PLANTS_OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
