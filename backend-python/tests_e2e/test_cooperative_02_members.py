"""Régression Coopérative · membres, agrégation des volumes, pièces de la coopérative (Slice 33)."""


def test_espace_cooperative_profil_et_pieces(world):
    """La coopérative a son profil réglementaire et sa liste de pièces, signalée « à valider par le métier »."""
    space = world.p.get("can.pres", "/api/cooperative/space")
    assert space["organization"]["id"] == world.org["can"]
    assert space["organization"]["profile_code"] == "cooperative_forestiere"
    checklist = {c["doc_type"]: c["status"] for c in space["checklist"]}
    assert checklist["statuts_cooperative"] == "soumis"
    assert checklist["immatriculation_rscoop"] == "manquant"
    assert "métier" in space["profile_note"]
    assert "conserve" in space["members_note"]


def test_membres_actifs_et_anciens(world):
    """La coopérative voit ses membres actifs et ses anciens membres avec leurs dates et le motif de sortie."""
    members = {m["member_org_id"]: m for m in world.p.get("can.pres", "/api/cooperative/members")}
    assert members[world.org["mas"]]["status"] == "active"
    assert members[world.org["cfn"]]["added_via"] == "ministere"
    left = members[world.org["sdl"]]
    assert left["status"] == "sortie" and left["left_on"] and left["status_reason"]
    current = world.p.get("can.pres", "/api/cooperative/members?include_former=false")
    assert world.org["sdl"] not in {m["member_org_id"] for m in current}


def test_agregation_des_volumes_par_membre_et_au_total(world):
    """Titres, AAC, volumes, grumes, pièces et taxes de chaque membre actif s'additionnent au total."""
    space = world.p.get("can.pres", "/api/cooperative/space")
    active = [m for m in space["members"] if m["status"] == "active"]
    assert all(m["aggregate"] for m in active)
    assert all(m["aggregate"] is None for m in space["members"] if m["status"] != "active")
    total = space["totals"]
    assert total["titles"]["total"] == sum(m["aggregate"]["titles"]["total"] for m in active)
    assert total["logs"]["total"] == sum(m["aggregate"]["logs"]["total"] for m in active)
    assert total["volumes"]["felled_stems"] == sum(
        m["aggregate"]["volumes"]["felled_stems"] for m in active
    )
    cfn = next(m for m in active if m["member_org_id"] == world.org["cfn"])
    assert cfn["aggregate"]["titles"]["total"] >= 1
    assert sum(cfn["aggregate"]["taxes"]["by_status"].values()) >= 1


def test_fiche_d_un_membre_en_lecture_seule(world):
    """La fiche d'un membre montre ses titres, AAC, volumes par essence, grumes, pièces et taxes."""
    detail = world.p.get("can.pres", f"/api/cooperative/members/{world.membership['mas']}")
    assert detail["membership"]["member_name"].startswith("Communauté de Massaha")
    assert any(t["title_type"] == "FC" for t in detail["titles"])
    assert detail["aacs"] and detail["aggregate"]["aac"]["total"] == len(detail["aacs"])
    assert isinstance(detail["felled_by_species"], list)
    world.p.call("can.pres", "GET", "/api/cooperative/members/999999", expect=404)


def test_recherche_d_organisations_a_ajouter(world):
    """La recherche ne propose que des entreprises ou communautés actives, non membres, sans leurs données."""
    found = world.p.get("can.pres", f"/api/cooperative/members/candidates?q={world.ns}")
    ids = {o["id"] for o in found}
    assert world.org["gte"] in ids and world.org["sdl"] in ids
    assert world.org["mas"] not in ids and world.org["can"] not in ids
    assert set(found[0]) == {"id", "name", "org_type", "provinces"}


def test_cycle_d_adhesion_suspension_reprise_et_sortie(world):
    """Un membre ajouté peut être suspendu (motif), réactivé, puis sortir (motif) ; il peut adhérer à nouveau."""
    added = world.p.post(
        "can.pres", "/api/cooperative/members", {"member_org_id": world.org["gte"]}, expect=201
    )
    url = f"/api/cooperative/members/{added['id']}"
    out = world.p.patch(
        "can.pres", url, {"status": "suspendue", "reason": "Cotisation impayée"}, expect=200
    )
    assert out["status"] == "suspendue"
    assert world.p.patch("can.pres", url, {"status": "active"}, expect=200)["status"] == "active"
    out = world.p.patch("can.pres", url, {"status": "sortie", "reason": "Démission"}, expect=200)
    assert out["status"] == "sortie" and out["left_on"]
    world.p.call("can.pres", "PATCH", url, json={"status": "active"}, expect=409)
    again = world.p.post(
        "can.pres", "/api/cooperative/members", {"member_org_id": world.org["gte"]}, expect=201
    )
    world.p.patch(
        "can.pres",
        f"/api/cooperative/members/{again['id']}",
        {"status": "sortie", "reason": "Essai terminé"},
        expect=200,
    )


def test_la_cooperative_depose_ses_pieces(world):
    """La coopérative dépose les pièces de son organisation, et seulement celles-là."""
    out = world.p.post(
        "can.pres",
        "/api/documents/upload",
        {
            "scope_type": "company",
            "scope_id": world.org["can"],
            "doc_type": "registre_membres_cooperative",
            "reference": world.ref("REGISTRE"),
        },
        expect=200,
    )
    assert out["status"] == "soumis"
    world.p.call(
        "can.pres",
        "POST",
        "/api/documents/upload",
        json={
            "scope_type": "company",
            "scope_id": world.org["mas"],
            "doc_type": "statuts_cooperative",
        },
        expect=403,
    )
