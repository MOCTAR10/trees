"""Convertit les statistiques pays Global Forest Watch (Gabon) en contexte national.

Entrée : les archives téléchargées depuis le tableau de bord pays GFW
(``docs/Doc Map/*.zip``). Sortie : ``data/gabon_context.json`` (versionné),
servi par ``GET /api/map/context`` : chiffres clés, émissions par année et
par facteur dominant, couvert par province.

Usage (depuis la racine du dépôt, venv local) ::

    backend-python\\.venv\\Scripts\\python.exe -m tools.import_gabon_context --source "docs/Doc Map"
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import zipfile
from datetime import date
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "gabon_context.json"

#: GADM level-1 order for Gabon (alphabetical) — the ``adm1`` codes of the
#: GFW exports. À vérifier against the official province codes.
PROVINCES = {
    "1": "Estuaire",
    "2": "Haut-Ogooué",
    "3": "Moyen-Ogooué",
    "4": "Ngounié",
    "5": "Nyanga",
    "6": "Ogooué-Ivindo",
    "7": "Ogooué-Lolo",
    "8": "Ogooué-Maritime",
    "9": "Woleu-Ntem",
}

DRIVERS_FR = {
    "Logging": "Exploitation forestière",
    "Permanent agriculture": "Agriculture permanente",
    "Shifting cultivation": "Agriculture itinérante",
    "Wildfire": "Feux",
    "Settlements and infrastructure": "Habitat et infrastructures",
    "Hard commodities": "Mines et matières premières",
    "Other natural disturbances": "Autres perturbations naturelles",
}


def _rows(source: Path, member: str) -> list[dict]:
    for archive in source.glob("*.zip"):
        with zipfile.ZipFile(archive) as zf:
            if member in zf.namelist():
                rows = list(csv.DictReader(io.TextIOWrapper(zf.open(member), encoding="utf-8")))
                return [r for r in rows if r.get("iso", "GAB") == "GAB"]
    return []


def _num(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build(source: Path) -> dict:
    def first(member: str, *columns: str) -> float | None:
        for row in _rows(source, member):
            for column in columns:
                if _num(row.get(column)) is not None:
                    return _num(row.get(column))
        return None

    natural = {
        r["sbtn_natural_forests__class"]: _num(r["area__ha"])
        for r in _rows(source, "natural_forest_2020__ha.csv")
    }
    change = (_rows(source, "net_tree_cover_change_from_height__ha.csv") or [{}])[0]
    flux = (_rows(source, "Forest_related_net_carbon_flux.csv") or [{}])[0]
    highlights = [
        (
            "land_area",
            "Superficie du pays",
            first("treecover_extent_2000__ha.csv", "area__ha"),
            "ha",
        ),
        (
            "tree_cover_2000",
            "Couvert arboré 2000 (≥ 30 %)",
            first("treecover_extent_2000__ha.csv", "umd_tree_cover_extent_2000__ha"),
            "ha",
        ),
        (
            "primary_forest_2001",
            "Forêt primaire humide 2001",
            first(
                "treecover_extent_2000_in_primary_forests_2001_tropics_only__ha.csv",
                "umd_tree_cover_extent_2000__ha",
            ),
            "ha",
        ),
        (
            "natural_forest_2020",
            "Forêt naturelle 2020 (référence RDUE)",
            natural.get("Natural Forest"),
            "ha",
        ),
        (
            "intact_forest_2000",
            "Paysages forestiers intacts 2000",
            first(
                "treecover_extent_2000_in_intact_forest_landscapes_2000__ha.csv",
                "umd_tree_cover_extent_2000__ha",
            ),
            "ha",
        ),
        (
            "plantations",
            "Plantations (palmier à huile…)",
            sum(
                _num(r["area__ha"]) or 0
                for r in _rows(source, "treecover_extent_in__in_plantations__ha.csv")
            )
            or None,
            "ha",
        ),
        (
            "agb_stock_2000",
            "Biomasse aérienne 2000",
            first("whrc_biomass_by_region__ha.csv", "whrc_aboveground_biomass_stock_2000__Mg"),
            "Mg",
        ),
        (
            "co2_stock_2000",
            "Stock de CO₂ aérien 2000",
            first("whrc_biomass_by_region__ha.csv", "whrc_aboveground_co2_stock_2000__Mg"),
            "Mg CO2",
        ),
        (
            "soil_carbon_2000",
            "Carbone organique du sol",
            first(
                "soil_organic_carbon_by_region__ha.csv",
                "gfw_soil_carbon_stocks_2000__Mg_C",
                "gfw_soil_carbon_stocks_2000__mg_c",
            ),
            "Mg C",
        ),
        ("net_change_ha", "Évolution nette du couvert (hauteur)", _num(change.get("net")), "ha"),
        (
            "net_flux_co2e",
            "Flux net de carbone forestier (2001-2024)",
            _num(flux.get("gfw_net_flux_co2e__Mg")),
            "Mg CO2e",
        ),
    ]
    emissions = sorted(
        (
            {
                "year": int(r["umd_tree_cover_loss__year"]),
                "co2e_mg": _num(r["gfw_gross_emissions_co2e_all_gases__Mg"]),
            }
            for r in _rows(source, "Forest_related_GHG_emissions.csv")
        ),
        key=lambda e: e["year"],
    )
    by_driver: dict[str, dict[int, float]] = {}
    for r in _rows(source, "Forest_related_GHG_emissions_by_dominant_driver.csv"):
        driver = r["wri_google_tree_cover_loss_drivers__driver"]
        by_driver.setdefault(driver, {})[int(r["umd_tree_cover_loss__year"])] = (
            _num(r["gfw_gross_emissions_co2e_all_gases__Mg"]) or 0.0
        )
    # Align on the last complete year of the national series (the driver
    # export can carry a partial current year).
    latest = (
        emissions[-1]["year"]
        if emissions
        else max((y for d in by_driver.values() for y in d), default=None)
    )
    total_latest = sum(d.get(latest, 0.0) for d in by_driver.values()) if latest else 0.0
    drivers = sorted(
        (
            {
                "driver": name,
                "label": DRIVERS_FR.get(name, name),
                "latest_co2e_mg": years.get(latest, 0.0),
                "latest_share": round(years.get(latest, 0.0) / total_latest, 4)
                if total_latest
                else None,
                "total_co2e_mg": round(sum(years.values()), 1),
            }
            for name, years in by_driver.items()
        ),
        key=lambda d: d["latest_co2e_mg"],
        reverse=True,
    )
    provinces: dict[str, dict] = {
        code: {"code": code, "name": name} for code, name in PROVINCES.items()
    }
    for member, column, key in (
        (
            "treecover_extent_2000_by_region__ha.csv",
            "umd_tree_cover_extent_2000__ha",
            "tree_cover_2000_ha",
        ),
        (
            "treecover_extent_2010_by_region__ha.csv",
            "umd_tree_cover_extent_2010__ha",
            "tree_cover_2010_ha",
        ),
        (
            "treecover_gain_2000-2020_by_region__ha.csv",
            "umd_tree_cover_gain__ha",
            "gain_2000_2020_ha",
        ),
    ):
        for r in _rows(source, member):
            if r.get("adm1") in provinces:
                provinces[r["adm1"]][key] = _num(r.get(column))
                if "area__ha" in r and "area_ha" not in provinces[r["adm1"]]:
                    provinces[r["adm1"]]["area_ha"] = _num(r["area__ha"])
    return {
        "country": "Gabon",
        "source": "Global Forest Watch — statistiques pays (téléchargements du tableau de bord)",
        "generated_at": date.today().isoformat(),
        "highlights": [
            {
                "key": k,
                "label": label,
                "value": round(v, 1) if v is not None else None,
                "unit": unit,
            }
            for k, label, v, unit in highlights
        ],
        "emissions_by_year": emissions,
        "emissions_latest_year": latest,
        "emissions_by_driver": drivers,
        "provinces": list(provinces.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    data = build(args.source)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"{len(data['highlights'])} chiffres clés, {len(data['emissions_by_year'])} années, "
        f"{len(data['emissions_by_driver'])} facteurs, {len(data['provinces'])} provinces -> {args.out}"
    )


if __name__ == "__main__":
    main()
