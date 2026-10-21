"""Régression · chantiers et projets : seuls les scans faits « Scanner pour ce projet » comptent."""

from tests_e2e.helpers import project_scan
from tools.pilot_client import sql


def test_un_participant_qui_scanne_dans_l_aac_compte_pour_le_chantier(world):
    """Un scan fait pour un chantier par un participant actif, dans l'AAC du chantier, compte pour le chantier."""
    pid = world.project["chantier"]
    out = project_scan(world, "hob.agent1", pid, i=11)
    assert out["project_id"] == pid and out["project_note"] is None


def test_un_scan_hors_de_l_aac_ne_compte_pas_pour_le_chantier(world):
    """Un scan fait hors de l'AAC du chantier ne compte pas pour le chantier."""
    out = project_scan(world, "hob.agent1", world.project["chantier"], aac="cfn1", i=12)
    assert out["project_id"] is None and out["project_note"] == "project_out_of_zone"


def test_un_non_participant_ne_scanne_pas_pour_le_chantier(world):
    """Un scan fait pour un chantier par une personne qui n'y participe pas ne compte pas."""
    out = project_scan(world, "hob.agent2", world.project["chantier"], i=13)
    assert out["project_id"] is None and out["project_note"] == "project_not_member"


def test_un_projet_ouvert_limite_a_un_cercle(world):
    """Un projet ouvert limité à un cercle ne compte que les scans faits dans ce cercle."""
    lon, lat = 13.61, -0.77
    pid = world.p.post(
        "admin",
        "/api/projects",
        {
            "title": f"Cercle {world.code()}",
            "description": f"Régression [{world.ns}]",
            "kind": "participatif",
            "latitude": lat,
            "longitude": lon,
            "radius_km": 10,
        },
        expect=(200, 201),
    )["id"]
    world.p.post("hob.agent2", f"/api/projects/{pid}/join", expect=200)
    assert project_scan(world, "hob.agent2", pid, i=14)["project_id"] == pid
    far = project_scan(world, "hob.agent2", pid, aac="cfn1", i=14)
    assert far["project_id"] is None and far["project_note"] == "project_out_of_zone"


def test_un_scan_deja_fait_ne_se_rattache_plus_a_un_projet(world):
    """Un scan déjà fait ne peut plus être rattaché après coup à un projet."""
    pid = world.project["moabi"]
    assert project_scan(world, "mas.agent1", None, aac="mas1", i=15)["project_id"] is None
    scan = sql(
        [
            (
                "SELECT id FROM tree_scans WHERE user_id = $1 AND project_id IS NULL"
                " ORDER BY created_at DESC LIMIT 1",
                (world.user["mas.agent1"],),
            )
        ]
    )[0][0]
    world.p.call(
        "mas.agent1",
        "POST",
        f"/api/projects/{pid}/attribute",
        json={"scan_id": scan["id"]},
        expect=(404, 405),
    )
    after = sql([("SELECT project_id FROM tree_scans WHERE id = $1", (scan["id"],))])[0][0]
    assert after["project_id"] is None
