"""Génère les planches de plaques QR à imprimer ou graver, sur place.

Chaque plaque porte le code registre de l'arbre (ex. ``GA-2026-000123``) en QR
**vectoriel** dont le carré imprimé mesure exactement ``QR_TAG_SIZE_CM``
(8 cm par défaut) — la taille que le scanner utilise comme règle — avec le
code en clair et la mention « République Gabonaise — MEF ». Deux sorties :

- **PDF A4** (imprimante thermique à transfert / laser bureautique, à 100 %) ;
- **SVG** une plaque par fichier (logiciels de gravure laser : LightBurn,
  EzCad… — import vectoriel à l'échelle 1:1).

Aucune donnée ne quitte le serveur : souveraineté de la production des
plaques.

Usage (depuis le conteneur API) ::

    python -m tools.print_qr_plates --codes GA-2026-000123 GA-2026-000124 --out /media/scans/plaques
    python -m tools.print_qr_plates --registry-prefix GA-DEMO- --out /media/scans/plaques
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.config import get_settings
from app.services.plate_print import plate_svg, plates_pdf
from app.services.plate_print import qr_drawing as _qr_drawing

__all__ = ["_qr_drawing", "plate_svg", "plates_pdf", "write_batch"]


def write_batch(codes: list[str], out_dir: Path, side_cm: float) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    pages = plates_pdf(codes, out_dir / "plaques_qr.pdf", side_cm)
    svg_dir = out_dir / "svg"
    svg_dir.mkdir(exist_ok=True)
    for code in codes:
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in code)
        (svg_dir / f"{safe}.svg").write_text(plate_svg(code, side_cm), encoding="utf-8")
    return {"plates": len(codes), "pages": pages, "out": str(out_dir)}


async def _registry_codes(prefix: str) -> list[str]:
    from app.services import db

    try:
        rows = await db.fetch_all(
            "SELECT tree_code FROM tree_registry WHERE tree_code LIKE $1 ORDER BY tree_code",
            f"{prefix}%",
        )
    finally:
        await db.close_pool()
    return [r["tree_code"] for r in rows]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--codes", nargs="+", help="codes registre à imprimer")
    group.add_argument(
        "--registry-prefix", help="tous les arbres du registre dont le code commence par…"
    )
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--size-cm", type=float, default=None, help="taille du carré QR (défaut : QR_TAG_SIZE_CM)"
    )
    args = parser.parse_args()
    codes = args.codes or asyncio.run(_registry_codes(args.registry_prefix))
    if not codes:
        raise SystemExit("Aucun code à imprimer.")
    side = args.size_cm or get_settings().qr_tag_size_cm
    summary = write_batch(codes, args.out, side)
    print(
        f"{summary['plates']} plaques ({side:g} cm), {summary['pages']} page(s) PDF + SVG -> {summary['out']}"
    )


if __name__ == "__main__":
    main()
