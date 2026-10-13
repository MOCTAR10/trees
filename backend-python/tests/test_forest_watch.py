"""Global Forest Watch checks at the scan point (Slice 16)."""

import json

import httpx
import pytest
import respx

from app.services import forest_watch

API = "https://data-api.globalforestwatch.org/dataset"


def test_clean_point_is_conforme():
    out = forest_watch.summarize(
        {
            "tree_cover_loss": [{"umd_tree_cover_loss__year": 0, "area__ha": 1.0}],
            "radd_alerts": [],
            "natural_forest": [{"sbtn_natural_forests__class": "Natural forest", "area__ha": 1}],
            "biomass": [{"avg": 312.44}],
            "protected_area": [],
            "logging_concession": [{"company": "Société Forestière Démo", "country": "GAB"}],
        }
    )
    assert out["verdict"] == "conforme"
    assert out["loss_years"] == []
    assert out["natural_forest_2020"] is True
    assert out["mapped_agb_mg_ha"] == 312.4
    assert out["logging_concession"] == "Société Forestière Démo"
    assert out["flags"] == []


def test_recent_loss_or_alert_is_a_deforestation_risk():
    out = forest_watch.summarize(
        {
            "tree_cover_loss": [
                {"umd_tree_cover_loss__year": 2012, "area__ha": 0.2},
                {"umd_tree_cover_loss__year": 2023, "area__ha": 0.4},
            ],
            "radd_alerts": [
                {"wur_radd_alerts__date": "2024-03-02", "wur_radd_alerts__confidence": "high"}
            ],
            "natural_forest": None,
            "biomass": None,
            "protected_area": [{"name": "Parc national de la Lopé"}],
            "logging_concession": None,
        }
    )
    assert out["verdict"] == "risque_deforestation"
    assert out["loss_years"] == [2012, 2023]
    assert out["radd_alerts"] == 1 and out["radd_latest"] == "2024-03-02"
    assert out["protected_area"] == "Parc national de la Lopé"
    assert set(out["flags"]) == {
        "perte_couvert_apres_2020",
        "alerte_radd_apres_2020",
        "aire_protegee",
    }
    assert set(out["unavailable"]) == {"natural_forest", "biomass", "logging_concession"}


def test_pre_cutoff_loss_only_is_not_a_risk():
    out = forest_watch.summarize(
        {k: [] for k in forest_watch.CHECKS}
        | {"tree_cover_loss": [{"umd_tree_cover_loss__year": 2015}]}
    )
    assert out["verdict"] == "conforme"


def test_everything_unavailable():
    out = forest_watch.summarize(dict.fromkeys(forest_watch.CHECKS))
    assert out["verdict"] == "indisponible"


@pytest.mark.asyncio
async def test_no_key_no_call():
    assert await forest_watch.check_point(0.4, 9.4) is None


@pytest.mark.asyncio
async def test_check_point_queries_each_dataset_with_the_key(monkeypatch):
    monkeypatch.setenv("GFW_API_KEY", "gfw-test-key")
    with respx.mock:
        routes = {
            name: respx.post(f"{API}/{ds}/latest/query/json").mock(
                return_value=httpx.Response(200, json={"data": []})
            )
            for name, (ds, _sql) in forest_watch.CHECKS.items()
        }
        respx.post(f"{API}/wur_radd_alerts/latest/query/json").mock(
            return_value=httpx.Response(500)
        )
        out = await forest_watch.check_point(0.4162, 9.4541)
        again = await forest_watch.check_point(0.41621, 9.45411)  # same ~110 m cell
    assert out is again  # cached
    loss = routes["tree_cover_loss"].calls.last.request
    assert loss.headers["x-api-key"] == "gfw-test-key"
    body = json.loads(loss.content)
    assert body["geometry"]["type"] == "Polygon"
    assert "umd_tree_cover_loss__year" in body["sql"]
    assert out["radd_alerts"] is None and "radd_alerts" in out["unavailable"]
    assert out["verdict"] == "conforme"
