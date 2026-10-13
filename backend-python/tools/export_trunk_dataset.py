"""Exporte le jeu d'entraînement « tronc » issu des scans mesurés au ruban/compas.

Chaque scan dont le DBH provient d'une **référence terrain** (ruban à 1,30 m ou
compas forestier) conserve sa photo DBH, le masque SAM 2.1 et l'étiquette
(``SCAN_MEDIA_DIR/<media_key>/``). Ce script les rassemble en un jeu prêt pour
l'entraînement d'un modèle de segmentation du tronc propre au Gabon :

    <out>/images/<media_key>.jpg
    <out>/masks/<media_key>.png      (blanc = tronc)
    <out>/manifest.csv               (DBH de référence, lecture photo, écart, essence…)

Seuls les scans dont la lecture photo reste dans ``--max-discrepancy`` % de la
référence sont retenus par défaut : leur masque est alors vraisemblablement
juste (un écart fort signale un masque à relire avant entraînement).

Usage (depuis le conteneur API) ::

    python -m tools.export_trunk_dataset --out /media/scans/_dataset
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import shutil
from pathlib import Path

from app.config import get_settings
from app.services import db

MANIFEST_FIELDS = (
    "media_key",
    "scan_id",
    "species",
    "dbh_cm",
    "method",
    "vision_dbh_cm",
    "discrepancy_pct",
    "distance_m",
    "has_mask",
)

_QUERY = """
SELECT id, media_key, species_scientific_name, measured_dbh_cm, dbh_method,
       dbh_vision_cm, ar_depth_m
FROM tree_scans
WHERE media_key IS NOT NULL
  AND dbh_method IN ('tape_circumference', 'caliper')
ORDER BY id
"""


def _discrepancy(row: dict) -> float | None:
    ref, vision = row.get("measured_dbh_cm"), row.get("dbh_vision_cm")
    if not ref or vision is None:
        return None
    return round((float(vision) - float(ref)) / float(ref) * 100.0, 1)


def export(
    rows: list[dict],
    media_root: Path,
    out: Path,
    max_discrepancy: float | None,
    include_unmasked: bool = False,
) -> dict:
    """Copy the selected scans into ``out``; returns counts."""
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "masks").mkdir(parents=True, exist_ok=True)
    kept, skipped = [], 0
    for row in rows:
        folder = media_root / row["media_key"]
        image = folder / "dbh.jpg"
        mask = folder / "mask.png"
        discrepancy = _discrepancy(row)
        too_far = (
            max_discrepancy is not None
            and discrepancy is not None
            and abs(discrepancy) > max_discrepancy
        )
        if not image.exists() or too_far or (not mask.exists() and not include_unmasked):
            skipped += 1
            continue
        shutil.copyfile(image, out / "images" / f"{row['media_key']}.jpg")
        if mask.exists():
            shutil.copyfile(mask, out / "masks" / f"{row['media_key']}.png")
        kept.append(
            {
                "media_key": row["media_key"],
                "scan_id": row.get("id"),
                "species": row.get("species_scientific_name") or "",
                "dbh_cm": row.get("measured_dbh_cm"),
                "method": row.get("dbh_method"),
                "vision_dbh_cm": row.get("dbh_vision_cm"),
                "discrepancy_pct": discrepancy,
                "distance_m": row.get("ar_depth_m"),
                "has_mask": mask.exists(),
            }
        )
    with (out / "manifest.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=MANIFEST_FIELDS)
        writer.writeheader()
        writer.writerows(kept)
    summary = {"exported": len(kept), "skipped": skipped, "out": str(out)}
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


async def run(out: Path, max_discrepancy: float | None, include_unmasked: bool) -> None:
    media_root = get_settings().scan_media_dir
    if not media_root:
        raise SystemExit("SCAN_MEDIA_DIR n'est pas configuré : aucun média conservé")
    try:
        rows = [dict(r) for r in await db.fetch_all(_QUERY)]
    finally:
        await db.close_pool()
    summary = export(rows, Path(media_root), out, max_discrepancy, include_unmasked)
    print(
        f"Scans de référence : {len(rows)} · exportés : {summary['exported']} · "
        f"écartés : {summary['skipped']} -> {summary['out']}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="dossier de sortie")
    parser.add_argument(
        "--max-discrepancy",
        type=float,
        default=10.0,
        help="écart photo/référence maximal en %% (défaut 10 ; -1 = sans filtre)",
    )
    parser.add_argument(
        "--include-unmasked", action="store_true", help="garder les scans sans masque SAM"
    )
    args = parser.parse_args()
    limit = None if args.max_discrepancy < 0 else args.max_discrepancy
    asyncio.run(run(args.out, limit, args.include_unmasked))


if __name__ == "__main__":
    main()
