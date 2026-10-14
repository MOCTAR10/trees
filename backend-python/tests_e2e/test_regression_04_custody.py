"""Régression · chaîne de garde de la grume (abattage → transport → réception → transformation)."""

from tests_e2e.helpers import authorised_trees, detail, felled_trees, slip


def test_abattage_enregistre_le_carnet_df10(world):
    """L'abattage d'une tige autorisée attribue un n° DF10 et la position de la souche."""
    code = authorised_trees(world)[0]
    world.p.post(
        "hob.agent2",
        "/api/felling/events",
        {"tree_code": code, "event": "abattu", "latitude": -0.775, "longitude": 13.605},
        expect=200,
    )
    tree = world.p.get("hob.agent2", f"/api/felling/trees/{code}")
    assert tree["status"] == "abattu" and tree["df10_entry_no"].startswith("DF10-")


def test_abattage_d_une_tige_non_autorisee_refuse(world):
    """Abattre une tige non autorisée est refusé en citant l'art. 14."""
    from tests_e2e.helpers import declare, line

    ln = line(world, "Aucoumea klaineana", 95)
    declare(world, [ln])
    r = world.p.call(
        "hob.agent1",
        "POST",
        "/api/felling/events",
        json={"tree_code": ln["tree_code"], "event": "abattu"},
        expect=409,
    )
    assert "art. 14" in detail(r)


def test_double_abattage_refuse(world):
    """Une grume ne peut être abattue deux fois."""
    code = felled_trees(world)[0]
    world.p.call(
        "hob.agent1",
        "POST",
        "/api/felling/events",
        json={"tree_code": code, "event": "abattu"},
        expect=409,
    )


def test_transport_hors_bordereau_refuse(world):
    """Le transport ne s'enregistre pas grume par grume (bordereau obligatoire, art. 135)."""
    code = felled_trees(world)[0]
    r = world.p.call(
        "hob.agent1",
        "POST",
        "/api/felling/events",
        json={"tree_code": code, "event": "transporte"},
        expect=409,
    )
    assert "bordereau" in detail(r)


def test_bordereau_avec_grume_non_abattue_refuse(world):
    """Un bordereau ne peut porter une grume non abattue."""
    code = authorised_trees(world)[0]
    slip(world, [code], expect=409)


def test_destinataire_doit_etre_une_autre_organisation(world):
    """Le destinataire d'un bordereau est une autre organisation existante."""
    code = felled_trees(world)[0]
    world.p.call(
        "hob.dg",
        "POST",
        "/api/transport/documents",
        json={
            "doc_type": "bordereau_roulage",
            "tree_codes": [code],
            "destination_org_id": world.org["hob"],
        },
        expect=400,
    )


def test_emission_met_les_grumes_en_transport(world):
    """Émettre le bordereau passe ses grumes « En transport »."""
    codes = felled_trees(world, 2)
    doc = slip(world, codes)
    world.p.patch("hob.dg", f"/api/transport/documents/{doc['id']}", {"status": "emis"})
    for code in codes:
        assert world.p.get("hob.dg", f"/api/felling/trees/{code}")["status"] == "transporte"


def test_grume_sur_deux_bordereaux_ouverts_refusee(world):
    """Une grume ne peut figurer sur deux bordereaux en cours."""
    code = felled_trees(world)[0]
    slip(world, [code])
    slip(world, [code], expect=409)


def test_seul_l_emetteur_emet_et_seul_le_destinataire_receptionne(world):
    """Émission par l'émetteur, réception par le destinataire uniquement."""
    code = felled_trees(world)[0]
    doc = slip(world, [code])
    world.p.call(
        "sdl.dg",
        "PATCH",
        f"/api/transport/documents/{doc['id']}",
        json={"status": "emis"},
        expect=403,
    )
    world.p.patch("hob.dg", f"/api/transport/documents/{doc['id']}", {"status": "emis"})
    world.p.call(
        "hob.dg",
        "PATCH",
        f"/api/transport/documents/{doc['id']}",
        json={"status": "receptionne"},
        expect=403,
    )
    world.p.patch("sdl.dg", f"/api/transport/documents/{doc['id']}", {"status": "receptionne"})
    tree = world.p.get("sdl.dg", f"/api/felling/trees/{code}")
    assert tree["status"] == "receptionne" and tree["is_holder"]


def test_transformation_par_le_detenteur_apres_reception(world):
    """Seule l'usine qui a réceptionné peut transformer, et seulement après réception."""
    code = felled_trees(world)[0]
    world.p.call(
        "sdl.dg",
        "POST",
        "/api/felling/events",
        json={"tree_code": code, "event": "transforme"},
        expect=403,
    )
    doc = slip(world, [code])
    world.p.patch("hob.dg", f"/api/transport/documents/{doc['id']}", {"status": "emis"})
    world.p.call(
        "sdl.dg",
        "POST",
        "/api/felling/events",
        json={"tree_code": code, "event": "transforme"},
        expect=403,
    )
    world.p.patch("sdl.dg", f"/api/transport/documents/{doc['id']}", {"status": "receptionne"})
    world.p.call(
        "hob.dg",
        "POST",
        "/api/felling/events",
        json={"tree_code": code, "event": "transforme"},
        expect=403,
    )
    world.p.post(
        "sdl.dg", "/api/felling/events", {"tree_code": code, "event": "transforme"}, expect=200
    )
    history = [h["event"] for h in world.p.get("sdl.dg", f"/api/felling/trees/{code}")["history"]]
    assert history == ["abattu", "transporte", "receptionne", "transforme"]


def test_bordereau_entrant_visible_par_le_destinataire(world):
    """Le destinataire voit le bordereau « entrant » émis vers lui."""
    code = felled_trees(world)[0]
    doc = slip(world, [code])
    world.p.patch("hob.dg", f"/api/transport/documents/{doc['id']}", {"status": "emis"})
    incoming = {d["id"]: d for d in world.p.get("sdl.dg", "/api/transport/documents")}
    assert incoming[doc["id"]]["direction"] == "entrant"


def test_fiche_grume_refusee_a_un_tiers(world):
    """Une organisation tierce ne consulte pas la fiche d'une grume qu'elle ne détient pas."""
    code = felled_trees(world)[0]
    world.p.call("cfn.dg", "GET", f"/api/felling/trees/{code}", expect=403)
