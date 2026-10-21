"""Régression Entreprise · chantiers d'AAC, projets, et économie circulaire (résidus → coopératives)."""

from tests_e2e.helpers import project_scan
from tools.pilot_client import sql


def _new_chantier(world, title: str, participation: str = "invitation") -> int:
    out = world.p.post(
        "hob.dg",
        "/api/projects",
        {
            "title": title,
            "description": f"Régression [{world.ns}]",
            "kind": "chantier",
            "aac_id": world.aac["hob1"],
            "participation": participation,
        },
        expect=(200, 201),
    )
    return out["id"]


def test_chantier_ouvert_sur_ses_aac_uniquement(world):
    """L'entreprise n'ouvre un chantier que sur ses propres AAC."""
    options = {o["id"] for o in world.p.get("hob.dg", "/api/projects/aac-options")}
    assert world.aac["hob1"] in options and world.aac["cfn1"] not in options


def test_liste_detail_et_vue_chantier(world):
    """L'entreprise retrouve son chantier, son détail et la vue terrain (AAC, tiges, équipe)."""
    projects = {p["id"]: p for p in world.p.get("hob.dg", "/api/projects")}
    assert world.project["chantier"] in projects
    detail = world.p.get("hob.dg", f"/api/projects/{world.project['chantier']}")
    assert detail
    view = world.p.get("hob.dg", f"/api/projects/{world.project['chantier']}/chantier")
    assert view["aac_id"] == world.aac["hob1"] and view.get("aac")


def test_chantier_sur_invitation(world):
    """Sur un chantier « sur invitation », seul l'invité rejoint ; il peut ensuite le quitter."""
    pid = _new_chantier(world, f"Chantier invitation {world.code()}")
    world.p.call("hob.agent2", "POST", f"/api/projects/{pid}/join", expect=403)
    world.p.call("hob.agent2", "POST", f"/api/projects/{pid}/accept", expect=404)
    world.p.post(
        "hob.dg", f"/api/projects/{pid}/invite", {"emails": [world.email("hob.agent2")]}, expect=200
    )
    world.p.post("hob.agent2", f"/api/projects/{pid}/accept", expect=200)
    world.p.post("hob.agent2", f"/api/projects/{pid}/leave", expect=200)


def test_invitation_d_un_compte_inconnu_refusee(world):
    """Inviter une adresse inconnue est refusé."""
    pid = _new_chantier(world, f"Chantier inconnu {world.code()}")
    world.p.call(
        "hob.dg",
        "POST",
        f"/api/projects/{pid}/invite",
        json={"emails": ["personne@inconnu.ga"]},
        expect=404,
    )


def test_seul_le_createur_gere_le_chantier(world):
    """Seul le créateur (ou le Ministère) invite et change le statut d'un chantier."""
    pid = _new_chantier(world, f"Chantier géré {world.code()}")
    world.p.call("cfn.dg", "POST", f"/api/projects/{pid}/invite", json={"emails": []}, expect=403)
    world.p.call(
        "cfn.dg", "POST", f"/api/projects/{pid}/status", json={"status": "closed"}, expect=403
    )
    world.p.call(
        "hob.dg", "POST", f"/api/projects/{pid}/status", json={"status": "archive"}, expect=422
    )


def test_chantier_cloture_refuse_les_rattachements(world):
    """Un chantier clôturé n'accepte plus de participant ni de scan."""
    pid = _new_chantier(world, f"Chantier clos {world.code()}", participation="open")
    world.p.post("hob.dg", f"/api/projects/{pid}/status", {"status": "closed"}, expect=200)
    world.p.call("hob.agent1", "POST", f"/api/projects/{pid}/join", expect=400)
    out = project_scan(world, "hob.agent1", pid)
    assert out["project_id"] is None and out["project_note"] == "project_closed"


def test_scanner_pour_un_projet_ouvert(world):
    """Un agent qui participe à un projet ouvert scanne pour ce projet : son scan compte pour le projet."""
    pid = world.project["moabi"]
    out = project_scan(world, "mas.agent1", pid, aac="mas1", i=3)
    assert out["project_id"] == pid and out["project_note"] is None
    detail = world.p.get("mas.agent1", f"/api/projects/{pid}")
    assert detail["my_scan_count"] >= 1


def _residue(world) -> tuple[int, int]:
    rows = sql(
        [
            (
                "INSERT INTO community_cooperatives (geom, cooperative_name, profile_type, capacity_kg_per_day,"
                " is_certified) VALUES (ST_SetSRID(ST_MakePoint(13.62, -0.76), 4326), $1, 'energy_briquettes',"
                " 800, true) RETURNING id",
                (world.label(f"Coopérative briquettes {world.code()}"),),
            ),
            (
                "INSERT INTO tree_scans_and_residues (user_id, geom, species_scientific_name, measured_dbh_cm,"
                " weight_branches_fine_kg, weight_branches_thick_kg, status, logging_company_id)"
                " VALUES ($1, ST_SetSRID(ST_MakePoint(13.61, -0.77), 4326), 'Aucoumea klaineana', 95, 420, 380,"
                " 'available', $1) RETURNING id",
                (world.user["hob.dg"],),
            ),
        ]
    )
    return rows[0][0]["id"], rows[1][0]["id"]


def test_residus_attribues_a_une_cooperative_puis_liberes(world):
    """L'entreprise attribue ses résidus de coupe à une coopérative, puis peut les libérer."""
    coop, residue = _residue(world)
    profile = world.p.get("hob.dg", "/api/company/profile")
    assert profile
    assert any(r["id"] == residue for r in world.p.get("hob.dg", "/api/company/residues"))
    coops = {
        c["id"] for c in world.p.get("hob.dg", f"/api/company/cooperatives?residue_id={residue}")
    }
    assert coop in coops
    out = world.p.post(
        "hob.dg", f"/api/company/residues/{residue}/allocate", {"cooperative_id": coop}, expect=200
    )
    assert out["status"] == "allocated"
    world.p.call(
        "cfn.dg", "POST", f"/api/company/residues/{residue}/release", expect=(403, 404, 409)
    )
    released = world.p.post("hob.dg", f"/api/company/residues/{residue}/release", expect=200)
    assert released["status"] == "available"
    world.p.call("hob.dg", "POST", f"/api/company/residues/{residue}/release", expect=409)


def test_une_entreprise_participe_aux_projets_des_autres(world):
    """Une entreprise rejoint un projet ouvert, y scanne pour le projet, quitte, répond à une invitation."""
    pid = world.project["moabi"]
    world.p.post("sdl.dg", f"/api/projects/{pid}/join", expect=200)
    assert project_scan(world, "sdl.dg", pid, aac="mas1", i=4)["project_id"] == pid
    world.p.post("sdl.dg", f"/api/projects/{pid}/leave", expect=200)
    chantier = _new_chantier(world, f"Chantier partenaire {world.code()}")
    world.p.post(
        "hob.dg",
        f"/api/projects/{chantier}/invite",
        {"emails": [world.email("sdl.dg"), world.email("gte.dg")]},
        expect=200,
    )
    world.p.post("sdl.dg", f"/api/projects/{chantier}/accept", expect=200)
    world.p.post("gte.dg", f"/api/projects/{chantier}/decline", expect=200)
    team = world.p.get("hob.dg", f"/api/projects/{chantier}")
    assert team
