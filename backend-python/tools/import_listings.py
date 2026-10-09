"""Import CITES / EU / CMS species-listing exports into compact caches.

Source files are the "download species list" CSV exports from
checklist.cites.org (CITES appendices), the EU wildlife-trade annexes, and
the CMS appendices. The raw exports are large and kept out of git; this
module distils the species carried by the engine (``wood_density_africa.json``)
into ``data/listings_cache.json`` and a derived legal knowledge document.

Usage:
    python -m tools.import_listings            # parse exports -> caches + doc
    python -m tools.import_listings --dry-run  # parse only, no writes
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DOCS_DIR = ROOT.parent / "docs"
WOOD_DENSITY_OUT = DATA_DIR / "wood_density_africa.json"
LISTINGS_OUT = DATA_DIR / "listings_cache.json"
LEGAL_OUT = ROOT / "knowledge" / "legal" / "cites_listings.json"

SOURCE = "CITES Appendices / EU Annexes / CMS (checklist.cites.org exports, 2026-10-09)"


def _largest(pattern: str) -> Path | None:
    matches = sorted(DOCS_DIR.glob(pattern), key=lambda p: p.stat().st_size, reverse=True)
    return matches[0] if matches else None


def _rows(path: Path):
    with open(path, encoding="utf-8-sig", errors="replace", newline="") as fh:
        yield from csv.DictReader(fh)


def _name(row: dict) -> str:
    """Scientific name, tolerating both 'Scientific Name' and 'ScientificName'."""
    return (row.get("Scientific Name") or row.get("ScientificName") or "").strip()


def load_cites(path: Path) -> dict[str, dict]:
    """Scientific name -> {appendix, listed_under, note} for current listings."""
    out: dict[str, dict] = {}
    for r in _rows(path):
        name = _name(r)
        appendix = (r.get("Listing") or "").strip()
        if not name or not appendix:
            continue
        out[name] = {
            "appendix": appendix,
            "listed_under": (r.get("Listed under") or name).strip(),
            "note": (r.get("Full note") or "").strip(),
        }
    return out


def load_eu(path: Path) -> dict[str, dict]:
    """Scientific name -> {listing, note} for EU annexes (A/B/C/D)."""
    out: dict[str, dict] = {}
    for r in _rows(path):
        name = _name(r)
        listing = (r.get("Listing") or "").strip()
        if not name or not listing:
            continue
        out[name] = {"listing": listing, "note": (r.get("Full note") or "").strip()}
    return out


def load_cms(path: Path) -> dict[str, dict]:
    """Scientific name -> {listing} for CMS appendices (I/II)."""
    out: dict[str, dict] = {}
    for r in _rows(path):
        name = _name(r)
        listing = (r.get("Listing") or "").strip()
        if name and listing:
            out[name] = {"listing": listing}
    return out


def import_all(dry_run: bool = False) -> dict[str, dict]:
    cites_path = _largest("cites_listings*comma_separated.csv")
    eu_path = _largest("eu_listings*comma_separated.csv")
    cms_path = _largest("cms_listings*comma_separated.csv")
    cites = load_cites(cites_path) if cites_path else {}
    eu = load_eu(eu_path) if eu_path else {}
    cms = load_cms(cms_path) if cms_path else {}
    our = set(json.loads(WOOD_DENSITY_OUT.read_text(encoding="utf-8")))
    print(
        f"loaded cites={len(cites)} ({cites_path.name if cites_path else '-'}), "
        f"eu={len(eu)}, cms={len(cms)}; engine species={len(our)}"
    )

    cache: dict[str, dict] = {}
    for name in sorted(our):
        entry: dict = {}
        if name in cites:
            entry["cites_appendix"] = cites[name]["appendix"]
            entry["cites_listed_under"] = cites[name]["listed_under"]
            entry["cites_note"] = cites[name]["note"]
        if name in eu:
            entry["eu_listing"] = eu[name]["listing"]
        if name in cms:
            entry["cms_listing"] = cms[name]["listing"]
        if entry:
            cache[name] = entry

    listed = sum(1 for e in cache.values() if e.get("cites_appendix"))
    print(f"matched {len(cache)} species ({listed} with a CITES appendix)")
    if not dry_run:
        LISTINGS_OUT.write_text(
            json.dumps(cache, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {LISTINGS_OUT.relative_to(ROOT)}")
    return cache


def build_legal_doc(cache: dict[str, dict], dry_run: bool = False) -> list[dict]:
    """One legal framework doc summarising the CITES-listed species we carry."""
    order = {"I": 0, "II": 1, "III": 2}
    listed = [(n, e) for n, e in cache.items() if e.get("cites_appendix")]
    listed.sort(key=lambda kv: (order.get(kv[1]["cites_appendix"], 9), kv[0]))
    if not listed:
        return []

    parts = []
    for name, e in listed:
        bits = [f"CITES Appendix {e['cites_appendix']}"]
        if e.get("eu_listing"):
            bits.append(f"EU Annex {e['eu_listing']}")
        if e.get("cms_listing"):
            bits.append(f"CMS Appendix {e['cms_listing']}")
        if e.get("cites_listed_under") and e["cites_listed_under"] != name:
            bits.append(f"listed as {e['cites_listed_under']}")
        parts.append(f"{name} ({'; '.join(bits)})")

    content = (
        "CITES-listed timber and tree species carried by this engine (Central African "
        "forests). Current listings: "
        + "; ".join(parts)
        + ". Legal consequence for residue valorization: branches, offcuts, bark, "
        "sawdust and stumps of a listed species remain legally the same species and "
        "cannot be traded internationally (raw, semi-finished or as a by-product) "
        "without a valid CITES permit and a non-detriment finding, in addition to the "
        "EU Annex documentation when the material crosses into the EU. Operators must "
        "keep provenance documentation, segregate listed-species residues in the "
        "traceability system, and record volumes separately. Check the current "
        "appendices and any annual export quota before shipping."
    )
    doc = {
        "id": "legal_cites_african_timber_2026",
        "content": content,
        "metadata": {
            "legal_framework_reference": "cites_appendix",
            "residue_type": "mixed",
            "language": "en",
            "source": SOURCE,
        },
    }
    if not dry_run:
        LEGAL_OUT.write_text(
            json.dumps([doc], indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"wrote {LEGAL_OUT.relative_to(ROOT)} ({len(listed)} species)")
    return [doc]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Import CITES/EU/CMS listing exports.")
    ap.add_argument("--dry-run", action="store_true", help="parse only, no writes")
    args = ap.parse_args(argv)
    cache = import_all(dry_run=args.dry_run)
    build_legal_doc(cache, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
