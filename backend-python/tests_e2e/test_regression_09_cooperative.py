"""Régression · coopérative : organisations membres et agrégation des volumes (planche 9, Slice 33)."""

from tools import seed_pilot


def _second_cooperative(world) -> tuple[int, str]:
    key = "coop2"
    if key in world.org:
        return world.org[key], f"{key}.pres"
    org = world.p.post(
        "admin",
        "/api/organizations",
        {
            "name": world.label("Coopérative du Woleu"),
            "org_type": "cooperative",
            "registration_no": world.ref(key),
        },
        expect=201,
    )["organization"]["id"]
    alias = f"{key}.pres"
    world.p.post(
        "admin",
        f"/api/organizations/{org}/accounts",
        {
            "email": world.email(alias),
            "password": seed_pilot.PASSWORD,
            "role": "cooperative",
            "first_name": "Rose",
            "last_name": "Ekang",
        },
        expect=201,
    )
    world.p.login(alias, world.email(alias), seed_pilot.PASSWORD)
    world.org[key] = org
    return org, alias


def test_une_cooperative_creee_sans_profil_recoit_le_profil_cooperative(world):
    """Une coopérative créée par le Ministère reçoit le profil « Coopérative forestière » et sa liste de pièces."""
    _, alias = _second_cooperative(world)
    space = world.p.get(alias, "/api/cooperative/space")
    assert space["organization"]["profile_code"] == "cooperative_forestiere"
    assert {c["status"] for c in space["checklist"]} == {"manquant"}


def test_une_cooperative_n_est_pas_son_propre_membre(world):
    """Une coopérative ne peut pas être son propre membre."""
    world.p.call(
        "can.pres",
        "POST",
        "/api/cooperative/members",
        json={"member_org_id": world.org["can"]},
        expect=409,
    )


def test_une_cooperative_n_est_pas_membre_d_une_autre(world):
    """Seules une entreprise ou une communauté peuvent être membres : une autre coopérative est refusée."""
    org, _ = _second_cooperative(world)
    world.p.call(
        "can.pres", "POST", "/api/cooperative/members", json={"member_org_id": org}, expect=409
    )


def test_un_membre_n_est_inscrit_qu_une_fois(world):
    """Une organisation n'a qu'une adhésion ouverte par coopérative."""
    world.p.call(
        "can.pres",
        "POST",
        "/api/cooperative/members",
        json={"member_org_id": world.org["mas"]},
        expect=409,
    )


def test_une_organisation_peut_adherer_a_plusieurs_cooperatives(world):
    """Une organisation peut adhérer à plusieurs coopératives (à valider par le métier)."""
    _, alias = _second_cooperative(world)
    out = world.p.post(
        alias, "/api/cooperative/members", {"member_org_id": world.org["mas"]}, expect=201
    )
    world.p.patch(
        alias,
        f"/api/cooperative/members/{out['id']}",
        {"status": "sortie", "reason": "Double adhésion vérifiée"},
        expect=200,
    )


def test_suspension_et_sortie_sont_motivees(world):
    """Suspendre un membre ou enregistrer sa sortie exige un motif."""
    url = f"/api/cooperative/members/{world.membership['mas']}"
    world.p.call("can.pres", "PATCH", url, json={"status": "suspendue"}, expect=422)
    world.p.call("can.pres", "PATCH", url, json={"status": "sortie", "reason": " "}, expect=422)


def test_la_date_de_sortie_suit_l_adhesion(world):
    """La date de sortie ne précède pas l'adhésion et n'est pas future."""
    url = f"/api/cooperative/members/{world.membership['mas']}"
    world.p.call(
        "can.pres",
        "PATCH",
        url,
        json={"status": "sortie", "reason": "x", "left_on": "2000-01-01"},
        expect=422,
    )
    world.p.call(
        "can.pres",
        "PATCH",
        url,
        json={"status": "sortie", "reason": "x", "left_on": "2999-01-01"},
        expect=422,
    )


def test_une_adhesion_sortie_reste_close(world):
    """Un membre sorti reste dans l'historique : sa fiche ne se rouvre pas, il adhère à nouveau."""
    world.p.call(
        "can.pres",
        "PATCH",
        f"/api/cooperative/members/{world.membership['sdl']}",
        json={"status": "active"},
        expect=409,
    )


def test_un_membre_suspendu_ou_sorti_ne_compte_pas_dans_les_totaux(world):
    """Seuls les membres actifs comptent dans les volumes agrégés."""
    url = f"/api/cooperative/members/{world.membership['cfn']}"
    before = world.p.get("can.pres", "/api/cooperative/space")["totals"]["titles"]["total"]
    cfn_titles = world.p.get("can.pres", url)["aggregate"]["titles"]["total"]
    world.p.patch("can.pres", url, {"status": "suspendue", "reason": "Vérification"}, expect=200)
    after = world.p.get("can.pres", "/api/cooperative/space")["totals"]["titles"]["total"]
    world.p.patch("can.pres", url, {"status": "active"}, expect=200)
    assert after == before - cfn_titles


def test_la_cooperative_ne_voit_pas_les_membres_d_une_autre(world):
    """Une coopérative ne lit ni ne modifie les membres d'une autre coopérative."""
    _, alias = _second_cooperative(world)
    mid = world.membership["mas"]
    world.p.call(alias, "GET", f"/api/cooperative/members/{mid}", expect=404)
    world.p.call(
        alias,
        "PATCH",
        f"/api/cooperative/members/{mid}",
        json={"status": "suspendue", "reason": "x"},
        expect=404,
    )
    assert mid not in {m["id"] for m in world.p.get(alias, "/api/cooperative/members")}


def test_le_membre_garde_ses_titres_et_ses_obligations(world):
    """Les titres et les pièces du membre restent les siens : la coopérative ne les détient pas."""
    sheet = world.p.get("admin", f"/api/organizations/{world.org['can']}/sheet")
    assert sheet["titles"] == []
    mas = world.p.get("admin", f"/api/organizations/{world.org['mas']}/sheet")
    assert mas["titles"] and mas["memberships"]


def test_le_membre_voit_sa_cooperative(world):
    """L'entreprise membre voit sa coopérative dans son espace, sans pouvoir la gérer."""
    space = world.p.get("cfn.dg", "/api/company/space")
    assert any(c["cooperative_org_id"] == world.org["can"] for c in space["cooperatives"])
    world.p.call("cfn.dg", "GET", "/api/cooperative/space", expect=403)
    world.p.call(
        "cfn.dg",
        "POST",
        "/api/cooperative/members",
        json={"member_org_id": world.org["gte"]},
        expect=403,
    )


def test_seul_le_ministere_gere_les_membres_depuis_la_fiche(world):
    """La coopérative passe par son espace : la gestion depuis la fiche organisation est réservée au Ministère."""
    world.p.call(
        "can.pres",
        "POST",
        f"/api/organizations/{world.org['can']}/members",
        json={"member_org_id": world.org["gte"]},
        expect=403,
    )
