"""Régression Ministère · titres, UFA, AAC, DME, conventions, autorisations, études (lecture, actes, PDF)."""


def _pdf(world, path):
    out = world.p.call("admin", "GET", path, expect=200, note=f"PDF {path}")
    assert bytes(out).startswith(b"%PDF"), path


def test_liste_et_detail_des_titres(world):
    """Le Ministère liste les titres et consulte un titre avec son statut."""
    ids = {t["id"] for t in world.p.get("admin", "/api/titles")}
    assert {world.title["hob"], world.title["cfn"], world.title["mas"]} <= ids
    title = world.p.get("admin", f"/api/titles/{world.title['hob']}")
    assert (title.get("status") or title.get("title", {}).get("status")) == "actif"


def test_ufa_et_aac_d_un_titre(world):
    """Le Ministère voit les UFA d'un titre et leurs AAC avec statut et dates."""
    units = world.p.get("admin", f"/api/titles/{world.title['hob']}/units")
    assert any(u["id"] == world.ufa["hob"] for u in units)
    aacs = {a["id"]: a for a in world.p.get("admin", f"/api/titles/units/{world.ufa['hob']}/aacs")}
    assert aacs[world.aac["hob1"]]["status"] == "ouvert"
    assert aacs[world.aac["hob0"]]["status"] == "ferme"


def test_dme_d_ufa_fixe_puis_retire(world):
    """Un DME officiel d'UFA prime sur le provisoire ; retiré, le provisoire s'applique de nouveau."""
    ufa = world.p.post(
        "admin",
        f"/api/titles/{world.title['hob']}/units",
        {"label": world.ref(f"REG-UFA-{world.code()}")},
        expect=201,
    )["id"]
    world.p.put(
        "admin",
        f"/api/titles/units/{ufa}/dme",
        {
            "entries": [
                {"species_scientific_name": "Lophira alata", "dme_cm": 90, "source": "Arrêté test"}
            ]
        },
    )

    def lophira():
        rows = world.p.get("admin", f"/api/titles/units/{ufa}/dme")
        rows = rows.get("entries", rows) if isinstance(rows, dict) else rows
        return next(r for r in rows if r["species_scientific_name"] == "Lophira alata")

    assert lophira()["dme_cm"] == 90 and lophira()["origin"] == "ufa"
    world.p.call("admin", "DELETE", f"/api/titles/units/{ufa}/dme/Lophira alata", expect=200)
    assert lophira()["dme_cm"] == 80 and lophira()["origin"] == "provisional"
    world.p.call("hob.dg", "DELETE", f"/api/titles/units/{ufa}/dme/Lophira alata", expect=403)


def test_resiliation_de_la_convention_definitive_ramene_le_titre_en_provisoire(world):
    """Résilier la convention définitive ramène le titre en « provisoire » ; l'entreprise le voit."""
    title = world.p.post(
        "admin",
        "/api/titles/register",
        {
            "title_type": "CFAD",
            "reference": world.ref(f"REG-RES-{world.code()}"),
            "holder_org_id": world.org["gte"],
            "status": "provisoire",
        },
        expect=201,
    )["id"]
    world.p.post(
        "admin",
        f"/api/titles/{title}/conventions",
        {"convention_type": "provisoire", "reference": world.ref("CP-RES")},
        expect=201,
    )
    final = world.p.post(
        "admin",
        f"/api/titles/{title}/conventions",
        {"convention_type": "definitive", "reference": world.ref("CD-RES")},
        expect=201,
    )
    assert any(
        t["id"] == title and t["status"] == "actif"
        for t in world.p.get("gte.dg", "/api/organizations/me/titles")
    )
    world.p.patch(
        "admin",
        f"/api/titles/{title}/conventions/{final['id']}",
        {"status": "resiliee", "motif": "Manquements au cahier des charges"},
    )
    assert any(
        t["id"] == title and t["status"] == "provisoire"
        for t in world.p.get("gte.dg", "/api/organizations/me/titles")
    )
    convs = world.p.get("admin", f"/api/titles/{title}/conventions")
    assert {c["status"] for c in convs} >= {"resiliee"}


def test_pdf_des_actes_du_titre(world):
    """Conventions, autorisations et études ont chacune leur PDF."""
    conv = world.p.get("admin", f"/api/titles/{world.title['hob']}/conventions")[0]
    _pdf(world, f"/api/titles/{world.title['hob']}/conventions/{conv['id']}/pdf")
    auth = world.p.get("admin", f"/api/titles/aacs/{world.aac['hob1']}/authorizations")[0]
    _pdf(world, f"/api/titles/authorizations/{auth['id']}/pdf")
    study = world.p.get("admin", f"/api/titles/{world.title['hob']}/studies")[0]
    _pdf(world, f"/api/titles/{world.title['hob']}/studies/{study['id']}/pdf")


def test_autorisations_d_une_aac_avec_notification(world):
    """Le Ministère voit les autorisations d'une AAC et la notification de démarrage."""
    auths = world.p.get("admin", f"/api/titles/aacs/{world.aac['hob1']}/authorizations")
    assert any(a["status"] == "delivre" and a.get("startup_notified_at") for a in auths)


def test_etudes_d_un_titre(world):
    """Le Ministère voit les études PPF/EIE d'un titre et leur certificat."""
    studies = world.p.get("admin", f"/api/titles/{world.title['hob']}/studies")
    assert any(
        s["study_type"] == "ppf" and s["status"] == "valide" and s.get("certificate_ref")
        for s in studies
    )
