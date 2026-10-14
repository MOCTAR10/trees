"""Régression Ministère · comptes, organisations et rattachements."""


def _items(payload):
    return payload.get("items", payload) if isinstance(payload, dict) else payload


def test_liste_des_comptes(world):
    """Le Ministère liste tous les comptes, avec rôle et état."""
    users = world.p.get("admin", "/api/admin/users")
    emails = {u["email"] for u in users}
    assert world.email("hob.dg") in emails and world.email("mef.dp2") in emails
    assert all("role" in u and "is_active" in u for u in users)


def test_desactiver_un_compte_bloque_la_connexion_puis_reactiver(world):
    """Un compte désactivé ne peut plus se connecter ; réactivé, il le peut à nouveau."""
    uid = world.user["cfn.agent1"]
    email = world.email("cfn.agent1")
    world.p.patch("admin", f"/api/admin/users/{uid}", {"is_active": False})
    r = world.p.http.post("/api/auth/login", json={"email": email, "password": "Pilote2026!"})
    assert r.status_code in (401, 403)
    world.p.patch("admin", f"/api/admin/users/{uid}", {"is_active": True})
    r = world.p.http.post("/api/auth/login", json={"email": email, "password": "Pilote2026!"})
    assert r.status_code == 200


def test_role_invalide_refuse(world):
    """Attribuer un rôle inexistant est refusé."""
    world.p.call(
        "admin",
        "PATCH",
        f"/api/admin/users/{world.user['cfn.agent1']}",
        json={"role": "super_admin"},
        expect=400,
    )


def test_compte_inconnu(world):
    """Modifier un compte inexistant renvoie 404."""
    world.p.call(
        "admin", "PATCH", "/api/admin/users/99999999", json={"display_name": "X"}, expect=404
    )


def test_le_ministere_ne_peut_pas_se_desactiver_lui_meme(world):
    """Un compte Ministère ne peut pas désactiver son propre compte."""
    me = next(
        u
        for u in world.p.get("mef.dp2", "/api/admin/users")
        if u["email"] == world.email("mef.dp2")
    )
    world.p.call(
        "mef.dp2", "PATCH", f"/api/admin/users/{me['id']}", json={"is_active": False}, expect=400
    )


def test_renommer_un_agent_visible_cote_agent(world):
    """Le nom et le matricule fixés par le Ministère sont ceux que voit l'agent."""
    uid = world.user["hob.agent2"]
    world.p.patch(
        "admin",
        f"/api/admin/users/{uid}",
        {"first_name": "Prisca", "last_name": "Mba-Ondo", "matricule": "AGT-HOB-02B"},
    )
    me = world.p.get("hob.agent2", "/api/auth/me")
    assert me.get("last_name") == "Mba-Ondo" and me.get("matricule") == "AGT-HOB-02B"


def test_statistiques_et_cooperatives(world):
    """Les statistiques d'administration et la liste des coopératives répondent."""
    assert world.p.get("admin", "/api/admin/stats")
    assert isinstance(world.p.get("admin", "/api/admin/cooperatives"), list)


def test_annuaire_des_organisations_par_province(world):
    """L'annuaire liste les organisations du pilote avec leur province et leurs titres."""
    rows = [
        o
        for o in world.p.get("admin", "/api/organizations/directory")
        if f"[{world.ns}]" in o["name"]
    ]
    by = {o["name"].split(" [")[0]: o for o in rows}
    assert (
        by["Bois du Haut-Ogooué"]["titles"] >= 1
        and "GA-2" in by["Bois du Haut-Ogooué"]["provinces"]
    )
    assert by["Coopérative des Artisans de Ntoum"]["org_type"] == "cooperative"


def test_fiche_organisation_complete(world):
    """La fiche d'une organisation montre titres, comptes, certifications et alertes."""
    sheet = world.p.get("admin", f"/api/organizations/{world.org['cfn']}/sheet")
    assert sheet["titles"] and sheet["accounts"]
    assert any(w["kind"] == "tax" for w in sheet["warnings"])


def test_detail_et_liste_des_organisations(world):
    """Le Ministère consulte la liste et le détail d'une organisation."""
    names = {o["name"] for o in _items(world.p.get("admin", "/api/organizations"))}
    assert any(f"[{world.ns}]" in n for n in names)
    org = world.p.get("admin", f"/api/organizations/{world.org['hob']}")
    assert (
        org.get("id") == world.org["hob"]
        or org.get("organization", {}).get("id") == world.org["hob"]
    )


def test_une_entreprise_ne_consulte_pas_une_autre_organisation(world):
    """Une entreprise ne lit pas la fiche d'une autre organisation."""
    world.p.call("cfn.dg", "GET", f"/api/organizations/{world.org['hob']}", expect=(403, 404))


def test_profils_reglementaires(world):
    """Les profils réglementaires (exploitant, transformateur, intégré…) sont disponibles."""
    codes = {p["code"] for p in world.p.get("admin", "/api/organizations/profiles")}
    assert {
        "exploitant_forestier",
        "transformateur",
        "integre",
        "negoce_export",
        "foret_communautaire",
    } <= codes


def test_comptes_a_rattacher_et_rattachement_idempotent(world):
    """Les comptes sans organisation sont listés et le rattachement en lot est rejouable."""
    orphans = world.p.get("admin", "/api/organizations/orphans")
    assert isinstance(_items(orphans), list)
    first = world.p.post("admin", "/api/organizations/backfill", expect=200)
    again = world.p.post("admin", "/api/organizations/backfill", expect=200)
    assert first is not None and again["created_count"] == 0 and again["linked_count"] == 0


def test_creation_d_organisation_et_de_compte_rattache(world):
    """Le Ministère crée une organisation puis un compte qui lui est rattaché."""
    org = world.p.post(
        "admin",
        "/api/organizations",
        {
            "name": world.label("Scierie de Ntoum"),
            "registration_no": world.ref("REG-SCN"),
            "profile_code": "transformateur",
        },
        expect=201,
    )
    oid = (org.get("organization") or org)["id"]
    acc = world.p.post(
        "admin",
        f"/api/organizations/{oid}/accounts",
        {
            "email": world.email("scn.dg"),
            "password": "Pilote2026!",
            "role": "company",
            "first_name": "Line",
            "last_name": "Ango",
        },
        expect=201,
    )
    assert acc["organization_id"] == oid
