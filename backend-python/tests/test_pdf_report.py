"""PDF export tests: service rendering + both endpoints (no DB / network)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import pdf_report


@pytest.fixture
def client():
    return TestClient(app)


V1_REPORT = {
    "species_scientific_name": "Aucoumea klaineana",
    "species_common_name_fr": "Okoumé",
    "species_confidence": 0.917,
    "measured_dbh_cm": 62.5,
    "dbh_method": "yolo_ar_hybrid",
    "dbh_confidence": 0.93,
    "estimated_height_m": 32.7,
    "estimated_age_years": 58.4,
    "age_model_used": "chapman_richards | engone2013_crosscheck=52y",
    "health_status": "saine_apparence",
    "soil_type": "clay",
    "canopy_density_fcd": 0.62,
    "narrative_fr": "Cet arbre témoigne de la forêt dense humide du Gabon — cœur du bassin.",
}

V2_PAYLOAD = {
    "residue_engine": {
        "species": "Aucoumea klaineana",
        "dbh_cm": 62.5,
        "height_m": 32.7,
        "total_waste_biomass_kg": 1561.8,
    },
    "valorization_plan": {
        "analysis_summary": {
            "species": "Aucoumea klaineana",
            "dbh_cm": 62.5,
            "height_m": 32.7,
            "total_waste_biomass_kg": 1561.8,
        },
        "residue_breakdown": {
            "canopy_and_branches": {
                "mass_kg": 460.0,
                "primary_recommendation": "Pyrolyse TLUD en biochar",
                "technical_protocol_summary": "450-550 °C",
            },
            "bark_and_organic_liquids": {
                "mass_kg": 190.0,
                "primary_recommendation": "Extraction de tanins",
                "industrial_use_case": "Colle sans formaldéhyde",
            },
            "stump_and_roots": {
                "volume_m3": 0.45,
                "artisan_or_pharmaceutical_value": "Mobilier artisanal, extraits",
            },
        },
        "win_win_synergy_plan": {
            "logging_company_csr_benefits": {
                "fsc_criteria_met": "Principe 3 et 4",
                "gabon_law_016_compliance": "Art. 251",
                "fire_hazard_reduction_index": "-70 %",
            },
            "community_impact_plan": {
                "target_cooperative_id": 1,
                "target_cooperative_name": "Coopérative Akanda",
                "profile_type": "agricultural_biochar",
                "logistical_distance_km": 8.4,
                "local_economic_value_creation_estimate": "3 à 5 emplois",
            },
        },
        "carbon_offset_metadata": {"avoided_methane_emissions_co2eq_kg": 2186.5},
    },
    "matched_cooperatives": [
        {
            "id": 1,
            "name": "Coopérative Akanda",
            "profile_type": "agricultural_biochar",
            "distance_km": 8.4,
            "is_certified": True,
        }
    ],
}


def _assert_pdf(data: bytes):
    assert isinstance(data, bytes)
    assert data.startswith(b"%PDF-")
    assert len(data) > 1000
    assert b"%%EOF" in data[-32:]


def test_render_measurement_pdf():
    _assert_pdf(pdf_report.render_measurement_pdf(V1_REPORT))


def test_render_valorization_pdf():
    _assert_pdf(pdf_report.render_valorization_pdf(V2_PAYLOAD))


def test_renders_with_missing_fields():
    # None / empty values must not raise
    _assert_pdf(pdf_report.render_measurement_pdf({}))
    _assert_pdf(pdf_report.render_valorization_pdf({}))


def test_renders_with_unencodable_characters():
    # Emoji / arrows not in WinAnsi must be dropped, not crash
    report = dict(V1_REPORT)
    report["narrative_fr"] = "Arbre sain ↔ 🌳 très robuste — cœur du massif"
    _assert_pdf(pdf_report.render_measurement_pdf(report))


def test_v1_report_pdf_endpoint(client):
    resp = client.post("/api/v1/report/pdf", json=V1_REPORT)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    _assert_pdf(resp.content)


def test_v2_report_pdf_endpoint(client):
    resp = client.post("/api/v2/report/pdf", json=V2_PAYLOAD)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    _assert_pdf(resp.content)
