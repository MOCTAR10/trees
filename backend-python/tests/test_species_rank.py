"""Species precision (Slice 16): regional flora + Gabon-aware re-ranking."""

import httpx
import pytest
import respx

from app.services import plantnet, species_rank

PLANTNET = "https://my-api.plantnet.org/v2/identify"


def _payload(*pairs):
    return {
        "results": [
            {"score": score, "species": {"scientificNameWithoutAuthor": name, "commonNames": []}}
            for name, score in pairs
        ]
    }


def test_priors_follow_the_species_base():
    assert species_rank.prior("Aucoumea klaineana") == (1.0, "essence_gabon")
    assert species_rank.prior("Okoumé")[1] == "essence_gabon"  # vernacular resolves
    assert species_rank.prior("Nothing existing here")[1] == "inconnue_base"


@pytest.mark.asyncio
async def test_gabon_species_overtakes_an_exotic_lookalike(monkeypatch):
    async def occurrences(name, lat, lon):
        return {"occurrences": 0 if name == "Quercus robur" else 40}

    monkeypatch.setattr(species_rank.gbif, "validate_species_for_location", occurrences)
    monkeypatch.setattr(
        species_rank,
        "prior",
        lambda n: (0.2, "hors_region") if n == "Quercus robur" else (1.0, "essence_gabon"),
    )
    ranked = await species_rank.rerank(
        [
            {"scientific_name": "Quercus robur", "score": 0.40},
            {"scientific_name": "Aucoumea klaineana", "score": 0.30},
        ],
        0.4,
        9.4,
    )
    assert [c["scientific_name"] for c in ranked] == ["Aucoumea klaineana", "Quercus robur"]
    assert ranked[0]["local_occurrences"] == 40
    assert ranked[0]["combined"] == pytest.approx(0.36)
    assert ranked[1]["combined"] == pytest.approx(0.40 * 0.6 * 0.7)


@pytest.mark.asyncio
async def test_gbif_outage_is_neutral(monkeypatch):
    async def down(name, lat, lon):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(species_rank.gbif, "validate_species_for_location", down)
    ranked = await species_rank.rerank(
        [{"scientific_name": "Aucoumea klaineana", "score": 0.5}], 0, 0
    )
    assert ranked[0]["local_occurrences"] is None
    assert ranked[0]["combined"] == pytest.approx(0.5)


@pytest.mark.asyncio
async def test_regional_flora_answers_first(monkeypatch):
    monkeypatch.setenv("PLANTNET_API_KEY", "k")
    with respx.mock:
        regional = respx.post(f"{PLANTNET}/k-west-central-tropical-africa").mock(
            return_value=httpx.Response(
                200, json=_payload(("Aucoumea klaineana", 0.62), ("Canarium schweinfurthii", 0.1))
            )
        )
        world = respx.post(f"{PLANTNET}/all").mock(
            return_value=httpx.Response(200, json=_payload())
        )
        result = await plantnet.identify_regional([b"x"], ["bark"])
    assert regional.called and not world.called
    assert result.project == "k-west-central-tropical-africa"
    assert [c["scientific_name"] for c in result.candidates] == [
        "Aucoumea klaineana",
        "Canarium schweinfurthii",
    ]


@pytest.mark.asyncio
async def test_global_flora_is_the_fallback(monkeypatch):
    monkeypatch.setenv("PLANTNET_API_KEY", "k")
    with respx.mock:
        respx.post(f"{PLANTNET}/k-west-central-tropical-africa").mock(
            return_value=httpx.Response(404, json={"message": "Species not found"})
        )
        respx.post(f"{PLANTNET}/all").mock(
            return_value=httpx.Response(200, json=_payload(("Terminalia superba", 0.45)))
        )
        result = await plantnet.identify_regional([b"x"], ["leaf"])
    assert result.project == "all"
    assert result.scientific_name == "Terminalia superba"
