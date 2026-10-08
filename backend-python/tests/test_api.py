"""API endpoint tests (service layer mocked, no DB)."""

import io

import pytest
from fastapi.testclient import TestClient

from app.main import app


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


@pytest.fixture
def client():
    return TestClient(app)


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


class _FakeMeasure:
    dbh_cm = 62.5
    method = "yolo_ar_hybrid"
    confidence = 0.93


class _FakePlantNet:
    scientific_name = "Aucoumea klaineana"
    score = 0.917


def test_v1_process_scan(client, monkeypatch):
    from app.api import v1

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

    monkeypatch.setattr(v1, "plantnet", type("M", (), {"identify": staticmethod(fake_identify)})())
    monkeypatch.setattr(
        v1, "gbif", type("G", (), {"validate_species_for_location": staticmethod(fake_validate)})()
    )
    monkeypatch.setattr(v1, "soilgrids", type("S", (), {"fetch_soil": staticmethod(fake_soil)})())
    monkeypatch.setattr(v1, "gee", type("E", (), {"canopy_density": staticmethod(fake_fcd)})())
    monkeypatch.setattr(v1.groq_llm, "chat_text", fake_narrative)
    monkeypatch.setattr(v1.db, "execute", fake_execute)
    monkeypatch.setattr(v1, "measure_dbh", lambda img, depth_m, focal_px: _FakeMeasure())

    resp = client.post(
        "/api/v1/process-scan",
        data={
            "latitude": "0.4162",
            "longitude": "9.4541",
            "ar_depth_m": "1.30",
            "focal_px": "2200",
        },
        files={
            "trunk_image": ("trunk.png", io.BytesIO(_png()), "image/png"),
            "leaf_image": ("leaf.png", io.BytesIO(_png((60, 140, 50))), "image/png"),
            "habitat_image": ("habitat.png", io.BytesIO(_png()), "image/png"),
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["species_scientific_name"] == "Aucoumea klaineana"
    assert body["measured_dbh_cm"] == 62.5
    assert body["dbh_method"] == "yolo_ar_hybrid"
    assert body["estimated_height_m"] is not None
    assert body["estimated_age_years"] is not None
    assert body["soil_type"] == "clay"
    assert body["canopy_density_fcd"] == 0.62
    assert body["species_common_name_fr"] == "Okoumé"
    assert body["narrative_fr"] is not None


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


class _FakeCoop(dict):
    def __getitem__(self, key):
        return dict.__getitem__(self, key)


def test_v2_process_scan(client, monkeypatch):
    from app.api import v2

    fake_coop = _FakeCoop(
        {
            "id": 3,
            "cooperative_name": "Coopérative Akanda",
            "profile_type": "agricultural_biochar",
            "is_certified": True,
            "distance_km": 8.4,
        }
    )

    async def fake_coops_near(lat, lon, radius_km=15.0, certified_only=False):
        if radius_km <= 15.0:
            return [fake_coop]
        return []

    async def fake_rag_query(**kwargs):
        return []

    async def fake_chat_json(system_prompt, user_prompt, **kwargs):
        return {
            "analysis_summary": {},
            "residue_breakdown": {
                "canopy_and_branches": {
                    "mass_kg": 460,
                    "primary_recommendation": "Pyrolyse en biochar (fertilisant) ou briquelettes de bois",
                    "technical_protocol_summary": "Pyrolyse lente à 400-500 C, refroidissement AGR réduit les émissions de CO2 de 90%",
                },
                "bark_and_organic_liquids": {
                    "mass_kg": 190,
                    "primary_recommendation": "Extraction de tanins pour colle industrielle",
                    "industrial_use_case": "Colle bois sans formaldéhyde pour panneaux agglomérés",
                },
                "stump_and_roots": {
                    "volume_m3": 0.45,
                    "artisan_or_pharmaceutical_value": "Bois sculpté pour mobilier, extraits racinaires médicinaux",
                },
            },
            "win_win_synergy_plan": {
                "logging_company_csr_benefits": {
                    "fsc_criteria_met": "Principe 5: utilisation durable des ressources forestières",
                    "gabon_law_016_compliance": "Art. 251: transformation locale des bois sur le territoire",
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
            "carbon_offset_metadata": {"avoided_methane_emissions_co2eq_kg": 0},
        }

    async def fake_execute(sql, *args):
        return "INSERT 0 1"

    monkeypatch.setattr(v2, "compute_residues", lambda **kwargs: _FakeResidues())
    monkeypatch.setattr(v2.db, "find_cooperatives_near", fake_coops_near)
    monkeypatch.setattr(v2.rag, "query_circular_economy", fake_rag_query)
    monkeypatch.setattr(v2.groq_llm, "chat_json", fake_chat_json)
    monkeypatch.setattr(v2.db, "execute", fake_execute)

    resp = client.post(
        "/api/v2/process-scan",
        json={
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 62.5,
            "latitude": 0.4162,
            "longitude": 9.4541,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Engine values passed through untouched
    assert body["residue_engine"]["total_waste_biomass_kg"] == 1275.0
    plan = body["valorization_plan"]
    # Deterministic invariants enforced over LLM output
    assert plan["analysis_summary"]["dbh_cm"] == 62.5
    assert plan["analysis_summary"]["total_waste_biomass_kg"] == 1275.0
    # 1275 kg * 0.05 CH4/kg * 28 GWP = 1785 kg CO2eq
    assert plan["carbon_offset_metadata"]["avoided_methane_emissions_co2eq_kg"] == 1785.0
    # Cooperative injected
    impact = plan["win_win_synergy_plan"]["community_impact_plan"]
    assert impact["target_cooperative_name"] == "Coopérative Akanda"
    assert impact["logistical_distance_km"] == 8.4
    assert body["matched_cooperatives"][0]["distance_km"] == 8.4
