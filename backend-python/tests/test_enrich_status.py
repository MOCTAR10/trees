"""Offline tests for the IUCN/CITES status enrichment parsers."""

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


def test_parse_cites_picks_most_restrictive_current():
    listings = [
        {"appendix": "II", "is_current": True},
        {"appendix": "I", "is_current": True},
        {"appendix": "III", "is_current": False},
    ]
    assert es.parse_cites(listings) == "I"
    assert es.parse_cites([{"appendix": "II", "is_current": False}]) is None
    assert es.parse_cites([]) is None


def test_token_reads_environment(monkeypatch):
    monkeypatch.setenv("IUCN_API_TOKEN", "secret-token")
    assert es._token("IUCN_API_TOKEN") == "secret-token"
    monkeypatch.delenv("IUCN_API_TOKEN", raising=False)
    # unknown token falls back to empty, never raising
    assert es._token("DEFINITELY_UNSET_TOKEN") in ("", os.environ.get("DEFINITELY_UNSET_TOKEN", ""))
