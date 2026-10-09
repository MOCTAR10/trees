"""Corpus expansion pipeline.

Acquires open reference data, normalises it, and generates embeddable
knowledge documents plus a machine-readable species reference table.

Sources
-------
- Global Wood Density Database (Zanne et al. 2009, Dryad doi:10.5061/dryad.234),
  mirrored on Zenodo (doi:10.5281/zenodo.13322441). Darwin Core archive with
  one wood-density measurement per occurrence; ``occurrences.txt`` carries the
  taxon and the geographic region, ``taxa.txt`` the family.
- GBIF Backbone Taxonomy API (https://api.gbif.org) for accepted names and
  vernacular (common) names.

Usage::

    python -m tools.expand_corpus fetch     # download + extract raw archive
    python -m tools.expand_corpus enrich    # GBIF vernacular names (cached)
    python -m tools.expand_corpus build     # write knowledge + reference files
    python -m tools.expand_corpus all       # all of the above

The ``fetch``/``enrich`` steps need network access and produce large raw
artefacts (git-ignored). ``build`` is offline and deterministic, so the
generated knowledge and reference files can be committed and re-embedded
without re-downloading anything.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
KNOWLEDGE_DIR = BACKEND_DIR / "knowledge"
EOL_DIR = RAW_DIR / "wood_density"

ARCHIVE_URL = "https://zenodo.org/records/13322441/files/archive.zip?download=1"
ARCHIVE_ZIP = RAW_DIR / "wood_density_archive.zip"
WOOD_DENSITY_OBA = "OBA_1000040"  # wood density trait ontology term

WOOD_DENSITY_OUT = DATA_DIR / "wood_density_africa.json"
GBIF_CACHE = DATA_DIR / "gbif_species_cache.json"
GENERATED_KNOWLEDGE = KNOWLEDGE_DIR / "species" / "africa_wood_density.json"
GENERATED_REFERENCE = DATA_DIR / "species_reference.json"
CURATED_SPECIES = KNOWLEDGE_DIR / "species" / "congo_basin_species.json"

SOURCE_DOI = "10.5061/dryad.234"
SOURCE_LABEL = "Zanne et al. 2009, Global Wood Density Database (Dryad doi:10.5061/dryad.234)"

# Dark-Congo-basin and wider African records share this substring in Locality.
AFRICA_MARKER = "africa"
GBIF_MATCH_URL = "https://api.gbif.org/v1/species/match"
GBIF_VERNACULAR_URL = "https://api.gbif.org/v1/species/{key}/vernacularNames"


# --------------------------------------------------------------------------- #
# Fetch
# --------------------------------------------------------------------------- #
def fetch(force: bool = False) -> None:
    """Download and extract the wood-density archive (idempotent)."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    if not ARCHIVE_ZIP.exists() or force:
        print(f"downloading {ARCHIVE_URL}")
        urllib.request.urlretrieve(ARCHIVE_URL, ARCHIVE_ZIP)
    EOL_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ARCHIVE_ZIP) as zf:
        for name in zf.namelist():
            if "__MACOSX" in name or name.endswith("/"):
                continue
            target = EOL_DIR / Path(name).name
            with zf.open(name) as src, open(target, "wb") as dst:
                dst.write(src.read())
    print(f"extracted {len(list(EOL_DIR.iterdir()))} files to {EOL_DIR}")


# --------------------------------------------------------------------------- #
# Parse
# --------------------------------------------------------------------------- #
def _read_tsv(path: Path):
    # utf-8-sig tolerates a possible BOM; Darwin Core archives vary.
    with open(path, encoding="utf-8-sig", errors="replace", newline="") as fh:
        yield from csv.DictReader(fh, delimiter="\t")


def parse_wood_density(africa_only: bool = True) -> dict[str, dict]:
    """Return scientific_name -> {density, n, family, regions} for Africa."""
    occ: dict[str, tuple[str, str]] = {}
    for row in _read_tsv(EOL_DIR / "occurrences.txt"):
        occ[row["OccurrenceID"]] = (row["TaxonID"], (row.get("Locality") or "").strip())

    family: dict[str, str] = {}
    for row in _read_tsv(EOL_DIR / "taxa.txt"):
        family[row["Identifier"]] = (row.get("Family") or "").strip()

    buckets: dict[str, list[float]] = defaultdict(list)
    regions: dict[str, set] = defaultdict(set)
    for row in _read_tsv(EOL_DIR / "measurements or facts.txt"):
        if not str(row.get("Measurement Type", "")).endswith(WOOD_DENSITY_OBA):
            continue
        taxon, locality = occ.get(row["Occurrence ID"], (None, ""))
        if not taxon:
            continue
        if africa_only and AFRICA_MARKER not in locality.lower():
            continue
        try:
            value = float(row["Measurement Value"])
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue
        buckets[taxon].append(value)
        if locality:
            regions[taxon].add(locality)

    result: dict[str, dict] = {}
    for name, values in buckets.items():
        result[name] = {
            "scientific_name": name,
            "family": family.get(name, ""),
            "density": round(sum(values) / len(values), 3),
            "n": len(values),
            "regions": sorted(regions.get(name, set())),
        }
    return dict(sorted(result.items()))


# --------------------------------------------------------------------------- #
# GBIF enrichment
# --------------------------------------------------------------------------- #
def _http_json(url: str, params: dict | None = None, timeout: int = 30) -> dict:
    if params:
        query = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
        url = f"{url}?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "forestry-rag/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _pick_vernacular(names: list[dict], langs: tuple[str, ...], limit: int = 3) -> list[str]:
    seen: list[str] = []
    for item in names:
        if item.get("language") not in langs:
            continue
        value = (item.get("vernacularName") or "").strip()
        key = value.lower()
        if value and key not in {s.lower() for s in seen}:
            seen.append(value)
        if len(seen) >= limit:
            break
    return seen


def enrich(species: list[str], pause: float = 0.05) -> dict[str, dict]:
    """Fetch GBIF accepted name + FR/EN vernacular names (cached, resumable)."""
    cache: dict[str, dict] = {}
    if GBIF_CACHE.exists():
        cache = json.loads(GBIF_CACHE.read_text(encoding="utf-8"))

    todo = [name for name in species if name not in cache]
    print(f"gbif enrichment: {len(todo)} to fetch ({len(cache)} cached)")
    for i, name in enumerate(todo, 1):
        entry: dict = {
            "scientific_name": name,
            "match": None,
            "vernacular_fr": [],
            "vernacular_en": [],
        }
        try:
            match = _http_json(GBIF_MATCH_URL, {"name": name})
            entry["match"] = {
                "usageKey": match.get("usageKey"),
                "scientificName": match.get("scientificName"),
                "status": match.get("status"),
                "family": match.get("family"),
            }
            key = match.get("usageKey")
            if key:
                v = _http_json(GBIF_VERNACULAR_URL.format(key=key))
                results = v.get("results", [])
                entry["vernacular_fr"] = _pick_vernacular(results, ("fra", "fr"))
                entry["vernacular_en"] = _pick_vernacular(results, ("eng", "en"))
        except Exception as exc:  # network hiccups shouldn't abort the batch
            entry["error"] = repr(exc)[:160]
        cache[name] = entry
        if i % 25 == 0 or i == len(todo):
            GBIF_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"  {i}/{len(todo)} ({name})")
        time.sleep(pause)
    return cache


# --------------------------------------------------------------------------- #
# Build
# --------------------------------------------------------------------------- #
def _growth_prior(density: float) -> tuple[float, float, float]:
    """Transparent Chapman-Richards prior from wood density.

    Heavier wood generally correlates with slower growth and longer-lived,
    larger stems; the mapping below is monotonic and bounded and is explicitly
    flagged so downstream users know it is a prior, not a fitted value.
    """
    a = min(max(70.0 + 40.0 * density, 70.0), 130.0)
    k = min(max(0.032 - 0.010 * density, 0.012), 0.032)
    return round(a, 1), round(k, 4), 1.35


def _slug(name: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in name.lower()).strip("_")


def _curated_species() -> set[str]:
    if not CURATED_SPECIES.exists():
        return set()
    entries = json.loads(CURATED_SPECIES.read_text(encoding="utf-8"))
    return {e["metadata"]["species"] for e in entries}


def build(skip_curated: bool = True) -> tuple[int, int]:
    """Write generated knowledge docs + species reference table."""
    density = json.loads(WOOD_DENSITY_OUT.read_text(encoding="utf-8"))
    gbif = json.loads(GBIF_CACHE.read_text(encoding="utf-8")) if GBIF_CACHE.exists() else {}
    curated = _curated_species() if skip_curated else set()

    docs: list[dict] = []
    reference: list[dict] = []
    for name, info in density.items():
        if name in curated:
            continue  # hand-authored doc already covers this species
        g = gbif.get(name, {})
        family = info.get("family") or (g.get("match") or {}).get("family") or ""
        fr = g.get("vernacular_fr") or []
        en = g.get("vernacular_en") or []
        a, k, p = _growth_prior(info["density"])
        d2 = round(info["density"], 2)  # single source of truth for text + reference
        regions = ", ".join(info.get("regions") or []) or "Africa"
        common = []
        if fr:
            common.append("FR: " + ", ".join(fr))
        if en:
            common.append("EN: " + ", ".join(en))
        common_txt = (" Common names " + "; ".join(common) + ".") if common else ""
        content = (
            f"{name} — {family or 'family unknown'}. Wood density rho = {d2:.2f} g/cm3 "
            f"(mean of {info['n']} measurements; region: {regions}). Source: {SOURCE_LABEL}."
            f"{common_txt} Growth constants are not locally fitted; the engine applies a transparent "
            f"density-based prior (A = {a} cm, k = {k}/yr, p = {p}) pending increment data."
        )
        doc_id = f"species_{_slug(name)}"
        docs.append(
            {
                "id": doc_id,
                "content": content,
                "metadata": {
                    "species": name,
                    "common_name_fr": fr[0] if fr else "",
                    "family": family,
                    "wood_density_g_cm3": info["density"],
                    "sample_count": info["n"],
                    "doc_type": "species",
                    "language": "en",
                    "source": SOURCE_LABEL,
                },
            }
        )
        reference.append(
            {
                "scientific_name": name,
                "common_name_fr": fr[0] if fr else "",
                "wood_density_g_cm3": d2,
                "family": family,
                "cr_asymptote_a_cm": a,
                "cr_rate_k": k,
                "cr_shape_p": p,
                "cr_source": "density_heuristic",
            }
        )

    GENERATED_KNOWLEDGE.parent.mkdir(parents=True, exist_ok=True)
    GENERATED_KNOWLEDGE.write_text(
        json.dumps(docs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    GENERATED_REFERENCE.parent.mkdir(parents=True, exist_ok=True)
    GENERATED_REFERENCE.write_text(
        json.dumps(reference, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {len(docs)} docs -> {GENERATED_KNOWLEDGE}")
    print(f"wrote {len(reference)} reference rows -> {GENERATED_REFERENCE}")
    return len(docs), len(reference)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _parse_wood_density_cmd() -> dict:
    parsed = parse_wood_density()
    WOOD_DENSITY_OUT.parent.mkdir(parents=True, exist_ok=True)
    WOOD_DENSITY_OUT.write_text(
        json.dumps(parsed, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"parsed {len(parsed)} African species -> {WOOD_DENSITY_OUT}")
    return parsed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["fetch", "parse", "enrich", "build", "all"])
    parser.add_argument("--force", action="store_true", help="re-download raw archive")
    args = parser.parse_args(argv)

    if args.command in ("fetch", "all"):
        fetch(force=args.force)
    if args.command in ("parse", "all"):
        _parse_wood_density_cmd()
    if args.command in ("enrich", "all"):
        species = list(json.loads(WOOD_DENSITY_OUT.read_text(encoding="utf-8")))
        enrich(species)
    if args.command in ("build", "all"):
        build()
    return 0


if __name__ == "__main__":
    sys.exit(main())
