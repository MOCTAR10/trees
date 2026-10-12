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


def test_render_df10_pdf():
    rows = [
        {
            "df10_entry_no": "DF10-2026-000001",
            "tree_code": "GA-1",
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 80.0,
            "felled_at": "2026-03-15",
            "status": "abattu",
        },
        {
            "tree_code": "GA-2",
            "species_scientific_name": "Entandrophragma cylindricum",
            "measured_dbh_cm": 95.0,
            "abandon_code": "creux",
            "abandon_label": "Creux / cœur pourri",
            "status": "autorise",
        },
    ]
    _assert_pdf(pdf_report.render_df10_pdf(rows, org_name="Bois SA", title_id=30, aac_id=40))
    _assert_pdf(pdf_report.render_df10_pdf([]))


def test_render_transport_pdf():
    doc = {
        "doc_type": "bordereau_roulage",
        "reference": "BDR-ABC123",
        "status": "emis",
        "from_label": "AAC-1",
        "to_label": "Port d'Owendo",
        "transporter": "Transport Bois",
        "vehicle_ref": "TR-1234",
        "volume_m3": 4.21,
    }
    trees = [
        {"tree_code": "GA-1", "species_scientific_name": "Aucoumea klaineana", "status": "abattu"}
    ]
    _assert_pdf(pdf_report.render_transport_pdf(doc, trees))
    _assert_pdf(pdf_report.render_transport_pdf({}, []))


def test_render_statement_pdf():
    data = {
        "period": {"year": 2026, "quarter": 1},
        "totals": {"stems_felled": 3, "estimated_volume_m3": 12.5, "by_status": {"abattu": 2}},
        "by_species": [{"species": "Aucoumea klaineana", "stems": 3, "volume_m3": 12.5}],
        "transformation_rate": 0.33,
        "abandoned": [{"code": "creux", "label": "Creux / cœur pourri", "count": 1}],
        "transport": {"documents": 2, "volume_m3": 8.0},
    }
    _assert_pdf(pdf_report.render_statement_pdf(data, org_name="Bois SA"))
    _assert_pdf(pdf_report.render_statement_pdf({}))


def test_render_valorization_pdf():
    _assert_pdf(pdf_report.render_valorization_pdf(V2_PAYLOAD))


def test_render_diligence_pdf():
    doc = {
        "id": 7,
        "org_name": "Bois SA",
        "title_id": 30,
        "title_ref": "T-1",
        "parcel_label": "Parcelle Nord",
        "parcel_wkt": "POLYGON((0 0, 1 0, 1 1, 0 0))",
        "status": "valide",
        "consultation_document_id": 55,
        "felled_stem_count": 3,
        "geolocated_stem_count": 2,
        "declared_volume_m3": 42.0,
    }
    _assert_pdf(pdf_report.render_diligence_pdf(doc, org_name="Bois SA"))
    _assert_pdf(pdf_report.render_diligence_pdf({}))


def test_render_authorization_pdf():
    doc = {
        "id": 12,
        "aac_id": 40,
        "aac_label": "AAC-2026",
        "org_name": "Bois SA",
        "title_id": 30,
        "title_ref": "T-1",
        "authorization_type": "permis_annuel_operations",
        "reference": "PAO-2026-1",
        "status": "delivre",
        "valid_from": "2026-01-01",
        "valid_to": "2026-12-31",
        "plan_document_id": 55,
        "startup_notified_at": "2026-02-01T08:00:00",
        "decision_motif": None,
    }
    _assert_pdf(pdf_report.render_authorization_pdf(doc, org_name="Bois SA"))
    _assert_pdf(pdf_report.render_authorization_pdf({}))


def test_renders_with_missing_fields():
    # None / empty values must not raise
    _assert_pdf(pdf_report.render_measurement_pdf({}))
    _assert_pdf(pdf_report.render_valorization_pdf({}))


def test_renders_with_rag_references():
    v1 = dict(V1_REPORT, rag_sources=["Chave et al. 2014 GCB", "knowledge/species/congo.json"])
    _assert_pdf(pdf_report.render_measurement_pdf(v1))

    v2 = {
        **V2_PAYLOAD,
        "valorization_plan": {
            **V2_PAYLOAD["valorization_plan"],
            "references": ["knowledge/legal/frameworks.json [loi_016_01]", "PEFC/PAFC"],
        },
    }
    _assert_pdf(pdf_report.render_valorization_pdf(v2))


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
