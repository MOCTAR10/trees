"""Régression Ministère · coopératives : membres et volumes agrégés sur la fiche organisation (Slice 33)."""


def test_fiche_d_une_cooperative_montre_membres_et_volumes(world):
    """La fiche d'une coopérative montre ses membres (actifs, anciens) et les volumes agrégés."""
    sheet = world.p.get("admin", f"/api/organizations/{world.org['can']}/sheet")
    coop = sheet["cooperative"]
    assert sheet["profile_code"] == "cooperative_forestiere"
    members = {m["member_org_id"]: m for m in coop["members"]}
    assert members[world.org["mas"]]["status"] == "active"
    assert members[world.org["sdl"]]["status"] == "sortie"
    assert coop["totals"]["titles"]["total"] >= 2
    assert coop["counts"]["active"] >= 2


def test_fiche_d_un_membre_indique_sa_cooperative(world):
    """La fiche d'une organisation membre indique sa coopérative ; celle d'une entreprise non membre n'en a pas."""
    sheet = world.p.get("admin", f"/api/organizations/{world.org['mas']}/sheet")
    assert sheet["cooperative"] is None
    assert sheet["memberships"][0]["cooperative_org_id"] == world.org["can"]
    assert world.p.get("admin", f"/api/organizations/{world.org['hob']}/sheet")["memberships"] == []


def test_le_ministere_gere_les_membres(world):
    """Le Ministère ajoute un membre à une coopérative, le suspend puis met fin à l'adhésion (motif)."""
    can = world.org["can"]
    added = world.p.post(
        "admin",
        f"/api/organizations/{can}/members",
        {"member_org_id": world.org["hob"]},
        expect=201,
    )
    assert added["added_via"] == "ministere"
    url = f"/api/organizations/{can}/members/{added['id']}"
    world.p.call("admin", "PATCH", url, json={"status": "sortie"}, expect=422)
    world.p.patch("admin", url, {"status": "suspendue", "reason": "Contrôle en cours"}, expect=200)
    out = world.p.patch("admin", url, {"status": "sortie", "reason": "Radiation"}, expect=200)
    assert out["status"] == "sortie"


def test_le_ministere_n_ajoute_de_membre_qu_a_une_cooperative(world):
    """Une entreprise n'a pas de membres : l'ajout est refusé."""
    world.p.call(
        "admin",
        "POST",
        f"/api/organizations/{world.org['hob']}/members",
        json={"member_org_id": world.org["mas"]},
        expect=409,
    )
