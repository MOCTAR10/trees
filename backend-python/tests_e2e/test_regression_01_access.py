"""Régression · comptes, rôles et cloisonnement."""

import pytest

ADMIN_ONLY = [
    ("GET", "/api/admin/inbox"),
    ("GET", "/api/admin/authorities"),
    ("GET", "/api/anomalies"),
    ("GET", "/api/controls"),
    ("GET", "/api/organizations/directory"),
]


def test_connexion_refusee_avec_un_mauvais_mot_de_passe(world):
    """Un mot de passe erroné est refusé (401)."""
    r = world.p.http.post(
        "/api/auth/login", json={"email": world.email("hob.dg"), "password": "faux-mdp-123"}
    )
    assert r.status_code == 401


def test_appel_sans_jeton_refuse(world):
    """Un appel protégé sans jeton est refusé."""
    r = world.p.http.get("/api/company/space")
    assert r.status_code in (401, 403)


@pytest.mark.parametrize("actor", ["hob.dg", "hob.agent1", "sdl.dg", "can.pres"])
@pytest.mark.parametrize("method,path", ADMIN_ONLY)
def test_espaces_du_ministere_reserves_au_ministere(world, actor, method, path):
    """Les files, la boussole, les anomalies et les contrôles sont réservés au Ministère."""
    world.p.call(actor, method, path, expect=403, note=f"{actor} → {path}")


def test_inspecteurs_du_ministere_ont_les_droits_du_ministere(world):
    """Les inspecteurs (rôle admin) accèdent aux files du Ministère."""
    for actor in ("mef.dp2", "mef.brigade"):
        assert "queues" in world.p.get(actor, "/api/admin/inbox")


def test_espace_entreprise_reserve_aux_entreprises(world):
    """L'espace « À faire » est réservé aux comptes entreprise."""
    for actor in ("hob.agent1", "can.pres", "admin"):
        world.p.call(actor, "GET", "/api/company/space", expect=403)


def test_courriel_unique_par_compte(world):
    """Deux comptes ne peuvent pas partager la même adresse."""
    world.p.call(
        "admin",
        "POST",
        f"/api/organizations/{world.org['sdl']}/accounts",
        json={
            "email": world.email("sdl.dg"),
            "password": "Motdepasse1",
            "role": "operator",
            "first_name": "A",
            "last_name": "B",
        },
        expect=409,
    )


def test_une_entreprise_ne_voit_que_ses_titres(world):
    """« Mes titres » ne liste que les titres de l'organisation du compte."""
    mine = {t["id"] for t in world.p.get("hob.dg", "/api/organizations/me/titles")}
    assert world.title["hob"] in mine and world.title["cfn"] not in mine
