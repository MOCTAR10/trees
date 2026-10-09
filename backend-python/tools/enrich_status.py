"""IUCN Red List status enrichment.

Pulls the latest IUCN Red List category from the free, auth-gated IUCN Red
List API v4 (``IUCN_API_TOKEN``) and caches the result so the corpus can be
rebuilt offline.

CITES / EU / CMS listings are NOT fetched here: those come from the
checklist.cites.org CSV exports via ``tools.import_listings`` (no token
required). See ``data/listings_cache.json``.

The token is read from the process environment or from the repository ``.env``.
The step is idempotent and resumable: existing cache entries are skipped and
the cache is flushed periodically.

Usage::

    python -m tools.enrich_status iucn
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
ENV_FILE = BACKEND_DIR.parent / ".env"
WOOD_DENSITY_OUT = DATA_DIR / "wood_density_africa.json"
IUCN_CACHE = DATA_DIR / "iucn_cache.json"

IUCN_URL = "https://api.iucnredlist.org/api/v4/taxa/scientific_name"

IUCN_CATEGORIES = {"EX", "EW", "CR", "EN", "VU", "NT", "LC", "DD", "NE"}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _token(name: str) -> str:
    if os.environ.get(name):
        return os.environ[name].strip()
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == name:
                return value.strip().strip('"').strip("'")
    return ""


def _http_json(
    url: str, params: dict | None = None, headers: dict | None = None, timeout: int = 40
) -> dict:
    if params:
        url = f"{url}?{'&'.join(f'{k}={urllib.parse.quote(str(v))}' for k, v in params.items())}"
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _load(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def _species() -> list[str]:
    if not WOOD_DENSITY_OUT.exists():
        raise SystemExit(f"missing {WOOD_DENSITY_OUT}; run tools.expand_corpus first")
    return list(json.loads(WOOD_DENSITY_OUT.read_text(encoding="utf-8")))


# --------------------------------------------------------------------------- #
# Parser (pure; unit-tested offline)
# --------------------------------------------------------------------------- #
def parse_iucn(payload: dict) -> dict | None:
    """Extract the latest Red List assessment category from an IUCN v4 payload."""
    assessments = payload.get("assessments") or []
    if not assessments:
        return None
    latest = assessments[0]
    category = latest.get("red_list_category") or {}
    code = latest.get("red_list_category_code") or category.get("code")
    if code and code not in IUCN_CATEGORIES:
        code = code.upper()
    return {
        "code": code,
        "assessment_id": latest.get("assessment_id"),
        "year": latest.get("year_published"),
    }


# --------------------------------------------------------------------------- #
# Enrichment
# --------------------------------------------------------------------------- #
def enrich_iucn(species: list[str], pause: float = 0.1) -> dict:
    token = _token("IUCN_API_TOKEN")
    if not token:
        print("IUCN_API_TOKEN not set — skipping IUCN enrichment")
        return _load(IUCN_CACHE)
    cache = _load(IUCN_CACHE)
    todo = [s for s in species if s not in cache]
    print(f"iucn: {len(todo)} to fetch ({len(cache)} cached)")
    for i, name in enumerate(todo, 1):
        genus, _, epithet = name.partition(" ")
        entry: dict = {"scientific_name": name, "status": None}
        try:
            data = _http_json(
                IUCN_URL,
                {"genus_name": genus, "species_name": epithet},
                {"Authorization": token, "Accept": "application/json"},
            )
            entry["status"] = parse_iucn(data)
        except Exception as exc:
            entry["error"] = repr(exc)[:160]
        cache[name] = entry
        if i % 25 == 0 or i == len(todo):
            IUCN_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"  {i}/{len(todo)} ({name})")
        time.sleep(pause)
    return cache


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["iucn"])
    parser.add_argument("--pause", type=float, default=0.1)
    args = parser.parse_args(argv)
    enrich_iucn(_species(), pause=args.pause)
    return 0


if __name__ == "__main__":
    sys.exit(main())
