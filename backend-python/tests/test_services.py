"""Tests for external service clients using respx HTTP mocks."""

import httpx
import pytest
import respx

from app.services import gbif, gee, http, plantnet, soilgrids

PLANTNET_PAYLOAD = {
    "results": [
        {
            "score": 0.917,
            "species": {
                "scientificNameWithoutAuthor": "Aucoumea klaineana",
                "scientificName": "Aucoumea klaineana Pierre",
                "family": {"scientificNameWithoutAuthor": "Burseraceae"},
                "commonNames": ["Okoumé"],
            },
            "gbif": {"id": 2690877},
        }
    ],
    "predictedOrgans": ["bark"],
}


@pytest.mark.asyncio
async def test_plantnet_identify_parses_best_match(monkeypatch):
    monkeypatch.setenv("PLANTNET_API_KEY", "test-key")
    with respx.mock:
        route = respx.post("https://my-api.plantnet.org/v2/identify/all").mock(
            return_value=httpx.Response(200, json=PLANTNET_PAYLOAD)
        )
        result = await plantnet.identify(images=[b"fake"], organs=["bark"], lang="fr")
    assert route.called
    assert result.scientific_name == "Aucoumea klaineana"
    assert result.score == pytest.approx(0.917, abs=1e-6)
    assert result.gbif_id == 2690877
    assert "Okoumé" in result.common_names
    sent = route.calls.last.request
    assert sent.url.params["api-key"] == "test-key"


@pytest.mark.asyncio
async def test_plantnet_rejects_wrong_image_count():
    with pytest.raises(ValueError):
        await plantnet.identify(images=[], organs=[])


@pytest.mark.asyncio
async def test_gbif_match_returns_taxon():
    with respx.mock:
        respx.get("https://api.gbif.org/v1/species/match").mock(
            return_value=httpx.Response(
                200,
                json={
                    "matchType": "EXACT",
                    "usageKey": 2690877,
                    "scientificName": "Aucoumea klaineana Pierre",
                    "confidence": 99,
                    "status": "ACCEPTED",
                    "rank": "SPECIES",
                    "family": "Burseraceae",
                    "genus": "Aucoumea",
                },
            )
        )
        taxon = await gbif.match_species("Aucoumea klaineana")
    assert taxon["usage_key"] == 2690877
    assert taxon["family"] == "Burseraceae"


@pytest.mark.asyncio
async def test_gbif_validate_species_rejects_no_local_occurrences():
    with respx.mock:
        respx.get("https://api.gbif.org/v1/species/match").mock(
            return_value=httpx.Response(
                200,
                json={"matchType": "EXACT", "usageKey": 123, "scientificName": "X"},
            )
        )
        respx.get("https://api.gbif.org/v1/occurrence/search").mock(
            return_value=httpx.Response(200, json={"count": 0, "results": []})
        )
        check = await gbif.validate_species_for_location("Aucoumea klaineana", 0.4162, 9.4541)
    assert check["valid"] is False
    assert check["reason"] == "no_local_occurrences"


def test_soil_classify():
    assert soilgrids.classify_soil(55, 20, 3.0) == "clay_organic"
    assert soilgrids.classify_soil(15, 75, 0.3) == "sandy_low_organic"
    assert soilgrids.classify_soil(30, 40, 1.0) == "loam"


@pytest.mark.asyncio
async def test_soilgrids_fetch_parses_depths_shape():
    def layer(name, mean):
        return {
            "name": name,
            "unit_measure": {"d_factor": 10, "mapped_units": "g/kg", "target_units": "%"},
            "depths": [{"label": "0-5cm", "values": {"mean": mean}}],
        }

    payload = {
        "properties": {"layers": [layer("clay", 450), layer("sand", 300), layer("soc", 180)]}
    }
    with respx.mock:
        respx.get("https://rest.isric.org/soilgrids/v2.0/properties/query").mock(
            return_value=httpx.Response(200, json=payload)
        )
        soil = await soilgrids.fetch_soil(0.4162, 9.4541)
    assert soil["clay_pct"] == 45.0
    assert soil["sand_pct"] == 30.0
    assert soil["soc_pct"] == 1.8
    assert soil["soil_class"] == "clay"


@pytest.mark.asyncio
async def test_soilgrids_returns_none_when_uncovered():
    def layer(name, mean):
        return {
            "name": name,
            "depths": [{"label": "0-5cm", "values": {"mean": mean}}],
        }

    payload = {
        "properties": {"layers": [layer("clay", None), layer("sand", None), layer("soc", None)]}
    }
    with respx.mock:
        respx.get("https://rest.isric.org/soilgrids/v2.0/properties/query").mock(
            return_value=httpx.Response(200, json=payload)
        )
        soil = await soilgrids.fetch_soil(0.0, 9.0)
    assert soil is None


@pytest.mark.asyncio
async def test_plantnet_multi_organ_sends_repeated_fields(monkeypatch):
    monkeypatch.setenv("PLANTNET_API_KEY", "test-key")
    with respx.mock:
        route = respx.post("https://my-api.plantnet.org/v2/identify/all").mock(
            return_value=httpx.Response(200, json=PLANTNET_PAYLOAD)
        )
        await plantnet.identify(images=[b"a", b"b"], organs=["bark", "leaf"], lang="fr")
    body = route.calls.last.request.content.decode("utf-8", errors="ignore")
    assert "organs" in body and "bark" in body and "leaf" in body


def test_gee_mock_is_deterministic():
    a = gee._mock_fcd(0.4162, 9.4541)
    b = gee._mock_fcd(0.4162, 9.4541)
    assert a == b
    assert 0.25 <= a <= 0.95


def test_competition_levels():
    assert gee.competition_level(None) == "unknown"
    assert gee.competition_level(0.8) == "dense_forest_high_competition"
    assert gee.competition_level(0.5) == "moderate_canopy"
    assert gee.competition_level(0.2) == "open_sun_low_competition"


def _span(decimal_range: str) -> float:
    lo, hi = (float(x) for x in decimal_range.split(","))
    return hi - lo


@pytest.mark.asyncio
async def test_gbif_occurrences_uses_radius():
    with respx.mock:
        route = respx.get("https://api.gbif.org/v1/occurrence/search").mock(
            return_value=httpx.Response(200, json={"count": 0, "results": []})
        )
        await gbif.occurrences_near(123, latitude=0.0, longitude=0.0, radius_km=50.0)
    params = route.calls.last.request.url.params
    expected = 2 * 50.0 / gbif._KM_PER_DEGREE
    assert _span(params["decimalLatitude"]) == pytest.approx(expected, abs=0.01)
    assert _span(params["decimalLongitude"]) == pytest.approx(expected, abs=0.01)


@pytest.mark.asyncio
async def test_gbif_occurrences_widens_longitude_at_high_latitude():
    with respx.mock:
        route = respx.get("https://api.gbif.org/v1/occurrence/search").mock(
            return_value=httpx.Response(200, json={"count": 0, "results": []})
        )
        await gbif.occurrences_near(123, latitude=60.0, longitude=10.0, radius_km=50.0)
    params = route.calls.last.request.url.params
    lat_span = _span(params["decimalLatitude"])
    lon_span = _span(params["decimalLongitude"])
    assert lon_span > lat_span * 1.5  # cos(60°) = 0.5 → ~2× wider box


@pytest.mark.asyncio
async def test_http_retries_transient_5xx_then_succeeds(monkeypatch):
    monkeypatch.setattr(http, "INITIAL_BACKOFF_S", 0.0)
    with respx.mock:
        route = respx.get("https://example.test/x").mock(
            side_effect=[httpx.Response(503), httpx.Response(200, json={"ok": True})]
        )
        resp = await http.request("GET", "https://example.test/x")
    assert resp.status_code == 200
    assert route.call_count == 2


@pytest.mark.asyncio
async def test_http_gives_up_after_retries(monkeypatch):
    monkeypatch.setattr(http, "INITIAL_BACKOFF_S", 0.0)
    with respx.mock:
        route = respx.get("https://example.test/y").mock(return_value=httpx.Response(500))
        resp = await http.request("GET", "https://example.test/y", retries=1)
    assert resp.status_code == 500
    assert route.call_count == 2


@pytest.mark.asyncio
async def test_http_does_not_retry_4xx(monkeypatch):
    monkeypatch.setattr(http, "INITIAL_BACKOFF_S", 0.0)
    with respx.mock:
        route = respx.get("https://example.test/z").mock(return_value=httpx.Response(404))
        resp = await http.request("GET", "https://example.test/z")
    assert resp.status_code == 404
    assert route.call_count == 1
