"""Régression · titres, conventions, AAC, PAO et autorisation d'exploiter (art. 14)."""

from tests_e2e.helpers import declare, detail, line


def _new_title(world, kind="CFAD"):
    return world.p.post(
        "cfn.dg",
        "/api/titles",
        {
            "title_type": kind,
            "reference": world.ref(f"REG-{kind}-{world.code()}"),
            "surface_ha": 1000,
        },
        expect=201,
    )["id"]


def test_cycle_du_titre_demande_exploration_provisoire(world):
    """Une demande passe en exploration puis en convention provisoire (CPAET)."""
    tid = _new_title(world)
    assert (
        world.p.patch("admin", f"/api/titles/{tid}", {"decision": "exploration"})["status"]
        == "exploration"
    )
    assert (
        world.p.patch("admin", f"/api/titles/{tid}", {"decision": "provisoire"})["status"]
        == "provisoire"
    )


def test_transition_de_titre_impossible_refusee(world):
    """Une demande ne peut pas devenir directement un titre actif (409)."""
    tid = _new_title(world)
    world.p.call("admin", "PATCH", f"/api/titles/{tid}", json={"decision": "actif"}, expect=409)


def test_rejet_de_titre_sans_motif_refuse(world):
    """Rejeter un titre exige un motif (400)."""
    tid = _new_title(world)
    world.p.call(
        "admin",
        "PATCH",
        f"/api/titles/{tid}",
        json={"decision": "rejete", "motif": " "},
        expect=400,
    )
    assert (
        world.p.patch(
            "admin", f"/api/titles/{tid}", {"decision": "rejete", "motif": "Dossier incomplet"}
        )["status"]
        == "rejete"
    )


def test_province_inconnue_refusee(world):
    """La province d'un titre doit exister parmi les 9 provinces."""
    world.p.call(
        "admin",
        "POST",
        f"/api/titles/{world.title['cfn']}/province",
        json={"province_code": "GA-99"},
        expect=404,
    )


def test_convention_definitive_exige_une_provisoire(world):
    """La convention définitive exige une convention provisoire en vigueur (409)."""
    title = world.p.post(
        "admin",
        "/api/titles/register",
        {
            "title_type": "CFAD",
            "reference": world.ref(f"REG-CD-{world.code()}"),
            "holder_org_id": world.org["gte"],
            "status": "provisoire",
        },
        expect=201,
    )
    world.p.call(
        "admin",
        "POST",
        f"/api/titles/{title['id']}/conventions",
        json={"convention_type": "definitive", "reference": world.ref("CD-X")},
        expect=409,
    )


def test_action_d_aac_hors_sequence_refusee(world):
    """Ouvrir une AAC dont le PAO n'est pas approuvé est impossible (409)."""
    aac = world.p.post(
        "admin",
        f"/api/titles/units/{world.ufa['hob']}/aacs",
        {"label": world.ref(f"REG-AAC-{world.code()}"), "campaign_year": 2027},
        expect=201,
    )
    world.p.call(
        "admin", "PATCH", f"/api/titles/aacs/{aac['id']}", json={"action": "ouvrir"}, expect=409
    )


def test_rejet_d_autorisation_sans_motif_refuse(world):
    """Rejeter une autorisation d'exploiter exige un motif (400)."""
    auth = world.p.post(
        "cfn.dg",
        f"/api/titles/aacs/{world.aac['cfn1']}/authorizations",
        {"authorization_type": "certificat_assiette", "reference": world.ref(f"CA-{world.code()}")},
        expect=201,
    )
    world.p.call(
        "admin",
        "PATCH",
        f"/api/titles/authorizations/{auth['id']}",
        json={"decision": "rejete"},
        expect=400,
    )
    world.p.patch(
        "admin",
        f"/api/titles/authorizations/{auth['id']}",
        {"decision": "rejete", "motif": "Plan de sondage absent"},
    )


def test_art14_aac_d_une_autre_organisation(world):
    """Déclarer sur l'AAC d'une autre organisation est bloqué (art. 14)."""
    r = declare(world, [line(world, "Aucoumea klaineana", 95)], actor="gte.dg", expect=422)
    assert "aac" in detail(r).lower() or "art" in detail(r).lower()


def test_art14_aac_sans_autorisation(world):
    """Une AAC sans autorisation délivrée ne permet aucune déclaration."""
    aac = world.p.post(
        "admin",
        f"/api/titles/units/{world.ufa['hob']}/aacs",
        {"label": world.ref(f"REG-NOAUTH-{world.code()}"), "campaign_year": 2027},
        expect=201,
    )
    world.aac["reg_noauth"] = aac["id"]
    body = {
        "permit_type": "CFAD",
        "permit_number": world.ref("REG"),
        "aac_id": aac["id"],
        "title_id": world.title["hob"],
        "lines": [line(world, "Aucoumea klaineana", 95)],
    }
    world.p.call("hob.dg", "POST", "/api/felling/declarations", json=body, expect=422)


def test_options_d_aac_signalent_le_blocage(world):
    """Le choix d'AAC de l'entreprise indique celles qui sont bloquées et pourquoi."""
    opts = {o["id"]: o for o in world.p.get("hob.dg", "/api/felling/aac-options")}
    assert world.aac["hob1"] in opts
    assert not (opts[world.aac["hob1"]].get("blocker") or opts[world.aac["hob1"]].get("gate"))
