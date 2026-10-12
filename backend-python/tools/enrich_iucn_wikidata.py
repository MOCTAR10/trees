"""IUCN Red List status enrichment from Wikidata (P141) — no API key required.

Fills ``data/iucn_cache.json`` in the same shape as the IUCN API path
(``{name: {"status": {"code": "XX"}}}``) so ``tools.expand_corpus build``
picks it up unchanged. Wikidata is CC0 and needs no token, so enrichment is
always reproducible and "democratic".

Usage::

    python -m tools.enrich_iucn_wikidata
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
WOOD_DENSITY_OUT = DATA_DIR / "wood_density_africa.json"
IUCN_CACHE = DATA_DIR / "iucn_cache.json"

SPARQL_URL = "https://query.wikidata.org/sparql"
USER_AGENT = "forestry-app/0.1 (IUCN enrichment)"

# English label (lowercased) -> IUCN category code.
LABEL_TO_CODE = {
    "extinct": "EX",
    "extinct in the wild": "EW",
    "critically endangered": "CR",
    "critically endangered (possibly extinct)": "CR",
    "endangered": "EN",
    "vulnerable": "VU",
    "near threatened": "NT",
    "least concern": "LC",
    "data deficient": "DD",
}

BATCH_SIZE = 40
PAUSE = 0.5


def _species_names() -> list[str]:
    if not WOOD_DENSITY_OUT.exists():
        raise SystemExit(f"missing {WOOD_DENSITY_OUT}; run tools.expand_corpus fetch first")
    return list(json.loads(WOOD_DENSITY_OUT.read_text(encoding="utf-8")))


def _query(names: list[str]) -> dict[str, str]:
    values = " ".join(f'"{n.replace(chr(34), "")}"' for n in names)
    query = (
        "SELECT ?taxonName ?statusLabel WHERE {"
        f" VALUES ?taxonName {{ {values} }}"
        " ?item wdt:P225 ?taxonName ."
        " OPTIONAL { ?item wdt:P141 ?status . }"
        ' SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }'
        " }"
    )
    url = f"{SPARQL_URL}?format=json&query=" + urllib.parse.quote(query)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.load(resp)
    out: dict[str, str] = {}
    for binding in payload["results"]["bindings"]:
        name = binding["taxonName"]["value"]
        label = binding.get("statusLabel", {}).get("value", "")
        code = LABEL_TO_CODE.get(label.strip().lower())
        if code:
            out[name] = code
    return out


def enrich(species: list[str]) -> dict[str, dict]:
    cache: dict[str, dict] = {}
    for i in range(0, len(species), BATCH_SIZE):
        batch = species[i : i + BATCH_SIZE]
        try:
            for name, code in _query(batch).items():
                cache[name] = {"status": {"code": code}}
            print(f"batch {i // BATCH_SIZE + 1}: +{len(batch)} queried")
        except Exception as exc:  # noqa: BLE001 — keep going on transient failures
            print(f"batch {i // BATCH_SIZE + 1} failed: {exc}", file=sys.stderr)
        time.sleep(PAUSE)
    return cache


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(IUCN_CACHE))
    args = parser.parse_args(argv)

    species = _species_names()
    cache = enrich(species)
    Path(args.out).write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(cache)} statuses to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
