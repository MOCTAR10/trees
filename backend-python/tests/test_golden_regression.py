"""Golden-response regression suite.

Re-runs the full v1 and v2 pipelines with ALL external services mocked and
compares the complete JSON response against committed baseline fixtures
(`tests/golden/*.json`). Catches any drift in output shape or values that
focused unit tests miss. Requires no network, API keys, or database.

`install_v1_fakes` / `install_v2_fakes` can run under pytest (pass a
`monkeypatch`) or standalone (returns a `restore` callable).
"""

from __future__ import annotations

import json
import types
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import v1, v2
from app.main import app

GOLDEN_DIR = Path(__file__).parent / "golden"
V1_GOLDEN = GOLDEN_DIR / "v1_report.json"
V2_GOLDEN = GOLDEN_DIR / "v2_response.json"


# ───────────────────────────── tiny helpers ─────────────────────────────


def _png(color=(90, 60, 30)) -> bytes:
    """Tiny valid PNG."""
    import struct
    import zlib

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    width = height = 8
    raw = b""
    for _ in range(height):
        raw += b"\x00" + bytes(color) * width
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


class _FakeMeasure:
    dbh_cm = 62.5
    method = "yolo_ar_hybrid"
    confidence = 0.93


class _FakePlantNet:
    scientific_name = "Aucoumea klaineana"
    score = 0.917


class _FakeResidues:
    species = "Aucoumea klaineana"
    dbh_cm = 62.5
    height_m = 32.7
    total_agb_kg = 3800.0
    total_bgb_kg = 760.0
    weight_branches_fine_kg = 120.0
    weight_branches_thick_kg = 340.0
    weight_bark_kg = 190.0
    weight_foliar_kg = 160.0
    volume_stump_m3 = 0.45
    weight_stump_kg = 315.0
    weight_roots_kg = 150.0
    volume_sawdust_m3 = 0.12
    total_waste_biomass_kg = 1275.0

    def to_dict(self):
        return {"species": self.species, "total_waste_biomass_kg": self.total_waste_biomass_kg}


def _install(monkeypatch, target, name, value, restores):
    if monkeypatch is None:
        original = getattr(target, name)
        restores.append(lambda: setattr(target, name, original))
        setattr(target, name, value)
    else:
        monkeypatch.setattr(target, name, value)


def install_v1_fakes(monkeypatch=None) -> list:
    restores: list = []

    async def fake_identify(**kwargs):
        return _FakePlantNet()

    async def fake_validate(name, lat, lon):
        return {"valid": True, "reason": "ok", "taxon": {"usage_key": 1}, "occurrences": 12}

    async def fake_soil(lat, lon):
        return {"clay_pct": 45.0, "sand_pct": 30.0, "soc_pct": 1.8, "soil_class": "clay"}

    async def fake_fcd(lat, lon):
        return {"fcd": 0.62, "source": "mock", "competition_level": None}

    async def fake_narrative(system_prompt, user_prompt, **kwargs):
        return "Cet arbre témoigne de la forêt dense humide du Gabon..."

    async def fake_execute(sql, *args):
        return "INSERT 0 1"

    _install(monkeypatch, v1, "plantnet", types.SimpleNamespace(identify=fake_identify), restores)
    _install(
        monkeypatch,
        v1,
        "gbif",
        types.SimpleNamespace(validate_species_for_location=fake_validate),
        restores,
    )
    _install(monkeypatch, v1, "soilgrids", types.SimpleNamespace(fetch_soil=fake_soil), restores)
    _install(monkeypatch, v1, "gee", types.SimpleNamespace(canopy_density=fake_fcd), restores)
    _install(monkeypatch, v1.groq_llm, "chat_text", fake_narrative, restores)
    _install(monkeypatch, v1.db, "execute", fake_execute, restores)
    _install(
        monkeypatch, v1, "measure_dbh", lambda img, depth_m, focal_px: _FakeMeasure(), restores
    )
    return restores


def install_v2_fakes(monkeypatch=None) -> list:
    restores: list = []
    coop = {
        "id": 3,
        "cooperative_name": "Coopérative Akanda",
        "profile_type": "agricultural_biochar",
        "is_certified": True,
        "distance_km": 8.4,
    }

    async def fake_coops_near(lat, lon, radius_km=15.0, certified_only=False):
        return [coop] if radius_km <= 15.0 else []

    async def fake_rag_query(**kwargs):
        return []

    async def fake_chat_json(system_prompt, user_prompt, **kwargs):
        return {
            "analysis_summary": {},
            "residue_breakdown": {
                "canopy_and_branches": {
                    "mass_kg": 460,
                    "primary_recommendation": "Pyrolyse en biochar (fertilisant) ou briquelettes de bois",
                    "technical_protocol_summary": "Pyrolyse lente à 400-500 C, refroidissement lent",
                },
                "bark_and_organic_liquids": {
                    "mass_kg": 190,
                    "primary_recommendation": "Extraction de tanins pour colle industrielle",
                    "industrial_use_case": "Colle bois sans formaldéhyde pour panneaux agglomérés",
                },
                "stump_and_roots": {
                    "volume_m3": 0.45,
                    "artisan_or_pharmaceutical_value": "Bois sculpté pour mobilier, extraits racinaires",
                },
            },
            "win_win_synergy_plan": {
                "logging_company_csr_benefits": {
                    "fsc_criteria_met": "Principe 5: utilisation durable des ressources forestières",
                    "gabon_law_016_compliance": "Art. 251: transformation locale des bois",
                    "fire_hazard_reduction_index": "Reduction de 70% du risque d'incendie local",
                },
                "community_impact_plan": {
                    "target_cooperative_id": None,
                    "target_cooperative_name": "",
                    "profile_type": "",
                    "logistical_distance_km": None,
                    "local_economic_value_creation_estimate": "Creation de 3-5 emplois locaux",
                },
            },
            "carbon_offset_metadata": {"avoided_methane_emissions_co2eq_kg": 100.0},
        }

    async def fake_execute(sql, *args):
        return "INSERT 0 1"

    _install(monkeypatch, v2, "compute_residues", lambda **kwargs: _FakeResidues(), restores)
    _install(monkeypatch, v2.db, "find_cooperatives_near", fake_coops_near, restores)
    _install(monkeypatch, v2.rag, "query_circular_economy", fake_rag_query, restores)
    _install(monkeypatch, v2.groq_llm, "chat_json", fake_chat_json, restores)
    _install(monkeypatch, v2.db, "execute", fake_execute, restores)
    return restores


def assert_json_approx(actual, expected, path="root"):
    """Recursive shape + value comparison (epsilon-tolerant floats, exact structure)."""
    if isinstance(expected, bool):
        assert actual is expected, f"{path}: {actual!r} != {expected!r}"
    elif isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path}: dict expected, got {type(actual).__name__}"
        assert set(actual) == set(expected), f"{path}: keys {set(actual)} != {set(expected)}"
        for key in expected:
            assert_json_approx(actual[key], expected[key], f"{path}.{key}")
    elif isinstance(expected, list):
        assert isinstance(actual, list), f"{path}: list expected, got {type(actual).__name__}"
        assert len(actual) == len(expected), f"{path}: len {len(actual)} != {len(expected)}"
        for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
            assert_json_approx(a, e, f"{path}[{i}]")
    elif isinstance(expected, (int, float)):
        assert isinstance(actual, (int, float)) and not isinstance(actual, bool), (
            f"{path}: number expected, got {type(actual).__name__}"
        )
        assert actual == pytest.approx(expected, rel=1e-6), f"{path}: {actual} != {expected}"
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"


def run_v1() -> dict:
    install_v1_fakes()
    resp = TestClient(app).post(
        "/api/v1/process-scan",
        data={
            "latitude": "0.4162",
            "longitude": "9.4541",
            "ar_depth_m": "1.30",
            "focal_px": "2200",
        },
        files={
            "trunk_image": ("trunk.png", _png(), "image/png"),
            "leaf_image": ("leaf.png", _png((60, 140, 50)), "image/png"),
            "habitat_image": ("habitat.png", _png(), "image/png"),
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def run_v2() -> dict:
    install_v2_fakes()
    resp = TestClient(app).post(
        "/api/v2/process-scan",
        json={
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 62.5,
            "latitude": 0.4162,
            "longitude": 9.4541,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def refresh_goldens() -> None:
    """Regenerate baseline fixtures (dev tool; run with `python -m tests.golden_regression`)."""
    GOLDEN_DIR.mkdir(exist_ok=True)
    for path, data in ((V1_GOLDEN, run_v1()), (V2_GOLDEN, run_v2())):
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {path} ({len(json.dumps(data))} chars)")


# ───────────────────────────── tests ─────────────────────────────


def test_v1_golden_regression(monkeypatch):
    install_v1_fakes(monkeypatch)
    resp = TestClient(app).post(
        "/api/v1/process-scan",
        data={
            "latitude": "0.4162",
            "longitude": "9.4541",
            "ar_depth_m": "1.30",
            "focal_px": "2200",
        },
        files={
            "trunk_image": ("trunk.png", _png(), "image/png"),
            "leaf_image": ("leaf.png", _png((60, 140, 50)), "image/png"),
            "habitat_image": ("habitat.png", _png(), "image/png"),
        },
    )
    assert resp.status_code == 200, resp.text
    golden = json.loads(V1_GOLDEN.read_text(encoding="utf-8"))
    assert_json_approx(resp.json(), golden)


def test_v2_golden_regression(monkeypatch):
    install_v2_fakes(monkeypatch)
    resp = TestClient(app).post(
        "/api/v2/process-scan",
        json={
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 62.5,
            "latitude": 0.4162,
            "longitude": 9.4541,
        },
    )
    assert resp.status_code == 200, resp.text
    golden = json.loads(V2_GOLDEN.read_text(encoding="utf-8"))
    assert_json_approx(resp.json(), golden)


if __name__ == "__main__":
    refresh_goldens()
