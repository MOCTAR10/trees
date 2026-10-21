"""Régression Coopérative · espace coopérative, résidus attribués et collectés, projets, limites du rôle."""

from tests_e2e.helpers import project_scan
from tools.pilot_client import sql


def _cooperative_id(world) -> int:
    me = world.p.get("can.pres", "/api/auth/me")
    assert me["role"] == "cooperative" and me.get("cooperative_id"), me
    return me["cooperative_id"]


def test_compte_cooperative_relie_a_sa_cooperative(world):
    """Un compte coopérative créé par le Ministère est relié à sa coopérative (profil, nom)."""
    _cooperative_id(world)
    profile = world.p.get("can.pres", "/api/cooperative/profile")
    assert profile["organization"].startswith("Coopérative des Artisans de Ntoum")
    assert profile["profile_type"] == "energy_briquettes"


def test_residus_attribues_puis_collectes(world):
    """Des résidus attribués par une entreprise sont vus puis collectés par la coopérative ; l'entreprise le voit."""
    coop = _cooperative_id(world)
    residue = sql(
        [
            (
                "INSERT INTO tree_scans_and_residues (user_id, geom, species_scientific_name, measured_dbh_cm,"
                " weight_branches_fine_kg, weight_branches_thick_kg, status, logging_company_id)"
                " VALUES ($1, ST_SetSRID(ST_MakePoint(9.80, 0.42), 4326), 'Aucoumea klaineana', 90, 300, 260,"
                " 'available', $1) RETURNING id",
                (world.user["hob.dg"],),
            )
        ]
    )[0][0]["id"]
    world.p.post(
        "hob.dg", f"/api/company/residues/{residue}/allocate", {"cooperative_id": coop}, expect=200
    )
    found = world.p.get(
        "can.pres", "/api/cooperative/residues?latitude=0.40&longitude=9.79&radius_km=50"
    )
    assert found["profile_type"] == "energy_briquettes"
    nearby = {r["id"]: r for r in found["residues"]}
    assert nearby[residue]["assigned_to_me"]
    out = world.p.post("can.pres", f"/api/cooperative/residues/{residue}/collect", expect=200)
    assert out["status"] == "collected"
    world.p.call("can.pres", "POST", f"/api/cooperative/residues/{residue}/collect", expect=409)
    company = {r["id"]: r for r in world.p.get("hob.dg", "/api/company/residues")}
    assert company[residue]["status"] == "collected"


def test_accueil_carte_et_especes_pour_la_cooperative(world):
    """La coopérative consulte son accueil, son groupe, la carte et les espèces ; son nom remonte au Ministère."""
    assert world.p.get("can.pres", "/api/home/summary") is not None
    assert world.p.get("can.pres", "/api/group") is not None
    assert world.p.get("can.pres", "/api/group/trees") is not None
    assert world.p.get("can.pres", "/api/my-trees") is not None
    world.p.patch("can.pres", "/api/home/me", {"first_name": "Esther", "last_name": "Mabika-Ndong"})
    users = {u["email"]: u for u in world.p.get("admin", "/api/admin/users")}
    assert users[world.email("can.pres")]["last_name"] == "Mabika-Ndong"
    assert world.p.get("can.pres", "/api/map/context")
    assert world.p.get("can.pres", "/api/map/tiles")
    assert world.p.get("can.pres", "/api/map/layers?zoom=8&bbox=9.3,0.2,10.0,0.6")
    found = world.p.get("can.pres", f"/api/map/search?q={world.ns}")
    found = found.get("results", found) if isinstance(found, dict) else found
    world.p.get("can.pres", f"/api/map/feature/{found[0]['layer']}/{found[0]['id']}")
    world.p.call("can.pres", "GET", "/api/map/point-check?lat=0.4&lon=9.8", expect=(200, 503))
    assert world.p.get("can.pres", "/api/species?q=Aucoumea")
    assert world.p.get("can.pres", "/api/species/Aucoumea klaineana")


def test_la_cooperative_participe_aux_projets(world):
    """La coopérative rejoint un projet ouvert, y scanne pour le projet, quitte et répond à une invitation."""
    pid = world.project["moabi"]
    assert any(p["id"] == pid for p in world.p.get("can.pres", "/api/projects"))
    assert world.p.get("can.pres", f"/api/projects/{pid}")
    world.p.call("can.pres", "GET", f"/api/projects/{pid}/chantier", expect=(200, 400, 404))
    world.p.post("can.pres", f"/api/projects/{pid}/join", expect=200)
    assert project_scan(world, "can.pres", pid, aac="mas1", i=5)["project_id"] == pid
    world.p.post("can.pres", f"/api/projects/{pid}/leave", expect=200)
    chantier = world.p.post(
        "hob.dg",
        "/api/projects",
        {
            "title": f"Chantier coop {world.code()}",
            "description": f"[{world.ns}]",
            "kind": "chantier",
            "aac_id": world.aac["hob1"],
        },
        expect=(200, 201),
    )["id"]
    world.p.call("can.pres", "POST", f"/api/projects/{chantier}/decline", expect=404)
    world.p.post(
        "hob.dg",
        f"/api/projects/{chantier}/invite",
        {"emails": [world.email("can.pres")]},
        expect=200,
    )
    world.p.post("can.pres", f"/api/projects/{chantier}/accept", expect=200)


def test_limites_du_role_cooperative(world):
    """La coopérative n'ouvre pas de projet, n'invite pas, ne clôture pas, ne lit pas la fiche d'une grume."""
    world.p.call("can.pres", "POST", "/api/projects", json={"title": "Projet coop"}, expect=403)
    assert world.p.get("can.pres", "/api/projects/aac-options") == []
    world.p.call(
        "can.pres",
        "POST",
        f"/api/projects/{world.project['moabi']}/invite",
        json={"emails": []},
        expect=403,
    )
    world.p.call(
        "can.pres",
        "POST",
        f"/api/projects/{world.project['moabi']}/status",
        json={"status": "closed"},
        expect=403,
    )
    world.p.call("can.pres", "GET", f"/api/felling/trees/{world.trees['d1'][0]}", expect=403)
