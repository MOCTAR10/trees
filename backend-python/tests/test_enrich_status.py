"""Offline tests for the IUCN status enrichment parser."""

import os

from tools import enrich_status as es


def test_parse_iucn_flat_payload():
    payload = {
        "taxon": {"scientific_name": "Baillonella toxisperma"},
        "assessments": [
            {"assessment_id": 42, "red_list_category_code": "VU", "year_published": "2019"},
            {"assessment_id": 7, "red_list_category_code": "EN", "year_published": "2000"},
        ],
    }
    latest = es.parse_iucn(payload)
    assert latest["code"] == "VU"
    assert latest["assessment_id"] == 42


def test_parse_iucn_nested_category_and_empty():
    nested = {"assessments": [{"red_list_category": {"code": "EN"}, "assessment_id": 1}]}
    assert es.parse_iucn(nested)["code"] == "EN"
    assert es.parse_iucn({"assessments": []}) is None


def test_enrich_status_has_no_cites_side_effects():
    # CITES now comes from tools.import_listings, not the Species+ API.
    assert not hasattr(es, "enrich_cites")
    assert not hasattr(es, "parse_cites")


def test_token_reads_environment(monkeypatch):
    monkeypatch.setenv("IUCN_API_TOKEN", "secret-token")
    assert es._token("IUCN_API_TOKEN") == "secret-token"
    monkeypatch.delenv("IUCN_API_TOKEN", raising=False)
    # unknown token falls back to empty, never raising
    assert es._token("DEFINITELY_UNSET_TOKEN") in ("", os.environ.get("DEFINITELY_UNSET_TOKEN", ""))
