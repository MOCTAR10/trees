"""Régression Agent de terrain · accueil, profil, carte, chantier, registre, carnet DF10, limites du rôle."""

from tests_e2e.helpers import authorised_trees


def _pdf(world, actor, path):
    out = world.p.call(actor, "GET", path, expect=200, note=f"PDF {path}")
    assert bytes(out).startswith(b"%PDF"), path


def _rows(payload):
    return payload.get("items", payload) if isinstance(payload, dict) else payload


def test_accueil_de_l_agent(world):
    """L'accueil de l'agent répond avec ses chiffres, son groupe et ses projets."""
    summary = world.p.get("hob.agent1", "/api/home/summary")
    assert summary is not None
    assert world.p.get("hob.agent1", "/api/group") is not None
    assert world.p.get("hob.agent1", "/api/group/trees") is not None
    assert world.p.get("hob.agent1", "/api/my-trees") is not None


def test_nom_saisi_par_l_agent_visible_par_le_ministere(world):
    """Le nom saisi par l'agent dans son profil est celui que voit le Ministère."""
    world.p.patch(
        "cfn.agent1", "/api/home/me", {"first_name": "Rodrigue", "last_name": "Mouketou-Ibinga"}
    )
    users = {u["email"]: u for u in world.p.get("admin", "/api/admin/users")}
    assert users[world.email("cfn.agent1")]["last_name"] == "Mouketou-Ibinga"


def test_agent_rattache_a_son_employeur(world):
    """L'agent voit l'entreprise qui l'emploie, ses titres et ses pièces."""
    assert world.p.get("hob.agent1", "/api/company/profile")
    org = world.p.get("hob.agent1", "/api/organizations/me")
    assert (org.get("id") or org.get("organization", {}).get("id")) == world.org["hob"]
    titles = {t["id"] for t in world.p.get("hob.agent1", "/api/organizations/me/titles")}
    assert world.title["hob"] in titles
    assert _rows(world.p.get("hob.agent1", "/api/organizations/me/documents")) is not None


def test_carte_et_especes_pour_l_agent(world):
    """L'agent consulte la carte (AAC, recherche, fiche, contrôle d'un point) et les espèces."""
    assert world.p.get("hob.agent1", "/api/map/context")
    assert world.p.get("hob.agent1", "/api/map/tiles")
    layers = world.p.get("hob.agent1", "/api/map/layers?zoom=12&bbox=13.55,-0.83,13.70,-0.68")
    assert layers["layers"]["aac"]
    found = world.p.get("hob.agent1", f"/api/map/search?q={world.ns}")
    found = found.get("results", found) if isinstance(found, dict) else found
    world.p.get("hob.agent1", f"/api/map/feature/{found[0]['layer']}/{found[0]['id']}")
    check = world.p.call(
        "hob.agent1", "GET", "/api/map/point-check?lat=-0.77&lon=13.61", expect=(200, 503)
    )
    if isinstance(check, dict) and "detail" in check:
        assert "GFW_API_KEY" in check["detail"]
    assert world.p.get("hob.agent1", "/api/species?q=Lophira")
    assert world.p.get("hob.agent1", "/api/species/Lophira alata")


def test_registre_des_arbres_de_son_entreprise(world):
    """L'agent voit les tiges de son entreprise, pas celles des autres."""
    codes = {t["tree_code"] for t in world.p.get("hob.agent1", "/api/felling/trees")}
    assert set(world.trees["d1"]) & codes and not set(world.trees["mas"]) & codes


def test_carnet_df10_et_etats_pour_l_agent(world):
    """L'agent consulte le carnet DF10 (et son PDF) et les états de son entreprise."""
    assert _rows(world.p.get("hob.agent1", "/api/traceability/df10"))
    _pdf(world, "hob.agent1", "/api/traceability/df10/pdf")
    assert world.p.get("hob.agent1", "/api/traceability/statements?year=2026")["totals"]


def test_abandon_d_une_tige_au_carnet_df10(world):
    """L'agent inscrit l'abandon d'une tige autorisée au carnet DF10 (motif codifié) ; le Ministère le voit."""
    code = authorised_trees(world)[0]
    world.p.patch(
        "hob.agent1",
        f"/api/traceability/df10/{code}",
        {"abandon_code": "penche", "notes": "Arbre penché vers la piste"},
    )
    rows = {r["tree_code"]: r for r in _rows(world.p.get("admin", "/api/traceability/df10"))}
    assert rows[code]["abandon_code"] == "penche"


def test_chantier_vu_par_l_agent_invite(world):
    """L'agent invité voit le chantier, son AAC et les tiges à mesurer."""
    detail = world.p.get("hob.agent1", f"/api/projects/{world.project['chantier']}")
    assert detail
    view = world.p.get("hob.agent1", f"/api/projects/{world.project['chantier']}/chantier")
    assert view["aac_id"] == world.aac["hob1"]


def test_limites_du_role_agent(world):
    """L'agent n'ouvre pas de chantier, n'invite pas, ne clôture pas et ne voit pas d'AAC à choisir."""
    world.p.call(
        "hob.agent1",
        "POST",
        "/api/projects",
        json={"title": "Chantier agent", "kind": "chantier", "aac_id": world.aac["hob1"]},
        expect=403,
    )
    assert world.p.get("hob.agent1", "/api/projects/aac-options") == []
    world.p.call(
        "hob.agent1",
        "POST",
        f"/api/projects/{world.project['chantier']}/invite",
        json={"emails": [world.email("hob.agent2")]},
        expect=403,
    )
    world.p.call(
        "hob.agent1",
        "POST",
        f"/api/projects/{world.project['chantier']}/status",
        json={"status": "closed"},
        expect=403,
    )
