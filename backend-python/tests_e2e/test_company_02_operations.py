"""Régression Entreprise · déclarations, registre, DF10, états, transport, RDUE, social, fiscalité, certifications."""

from tests_e2e.helpers import felled_trees, slip


def _pdf(world, actor, path):
    out = world.p.call(actor, "GET", path, expect=200, note=f"PDF {path}")
    assert bytes(out).startswith(b"%PDF"), path


def _rows(payload):
    return payload.get("items", payload) if isinstance(payload, dict) else payload


def test_detail_conformite_et_plaques_de_sa_declaration(world):
    """L'entreprise consulte sa déclaration, son évaluation de conformité et imprime ses plaques QR."""
    d = world.p.get("hob.dg", f"/api/felling/declarations/{world.decl['d3']}")
    assert (d.get("declaration") or d)["status"] == "rejetee"
    ev = world.p.get("hob.dg", f"/api/compliance/felling/{world.decl['d3']}")
    assert ev
    _pdf(world, "hob.dg", f"/api/felling/declarations/{world.decl['d1']}/plates.pdf")


def test_declaration_d_une_autre_entreprise_inaccessible(world):
    """Une entreprise ne lit ni la déclaration ni la conformité d'une autre entreprise."""
    world.p.call(
        "cfn.dg", "GET", f"/api/felling/declarations/{world.decl['d1']}", expect=(403, 404)
    )
    world.p.call("cfn.dg", "GET", f"/api/compliance/felling/{world.decl['d1']}", expect=(403, 404))


def test_registre_des_arbres_de_l_entreprise(world):
    """Le registre de l'entreprise liste ses tiges, pas celles des autres."""
    codes = {t["tree_code"] for t in world.p.get("hob.dg", "/api/felling/trees")}
    assert set(world.trees["d1"]) & codes
    assert not set(world.trees["mas"]) & codes


def test_carnet_df10_et_etats_de_l_entreprise(world):
    """L'entreprise tient son carnet DF10 et ses états de production (avec PDF)."""
    rows = _rows(world.p.get("hob.dg", "/api/traceability/df10"))
    assert any(r.get("df10_entry_no") for r in rows)
    _pdf(world, "hob.dg", "/api/traceability/df10/pdf")
    st = world.p.get("hob.dg", "/api/traceability/statements?year=2026")
    assert st["totals"]["stems_felled"] >= 7
    _pdf(world, "hob.dg", "/api/traceability/statements/pdf?year=2026")


def test_destinataires_bordereau_detail_et_pdf(world):
    """L'entreprise choisit un destinataire, consulte son bordereau et son PDF ; un tiers ne le peut pas."""
    dests = {d["id"] for d in world.p.get("hob.dg", "/api/transport/destinations")}
    assert world.org["sdl"] in dests and world.org["hob"] not in dests
    doc = slip(world, felled_trees(world))
    detail = world.p.get("hob.dg", f"/api/transport/documents/{doc['id']}")
    assert detail["document"]["destination_org_id"] == world.org["sdl"]
    _pdf(world, "hob.dg", f"/api/transport/documents/{doc['id']}/pdf")
    world.p.call("cfn.dg", "GET", f"/api/transport/documents/{doc['id']}", expect=403)


def test_destinataire_lit_le_bordereau_entrant(world):
    """L'usine destinataire lit le détail et le PDF du bordereau qui lui est adressé."""
    doc = slip(world, felled_trees(world))
    world.p.patch("hob.dg", f"/api/transport/documents/{doc['id']}", {"status": "emis"})
    assert world.p.get("sdl.dg", f"/api/transport/documents/{doc['id']}")["trees"]
    _pdf(world, "sdl.dg", f"/api/transport/documents/{doc['id']}/pdf")


def test_diligence_rdue_de_l_entreprise(world):
    """L'entreprise suit sa diligence RDUE : liste, détail, grumes localisées, attestation."""
    rows = _rows(world.p.get("hob.dg", "/api/eudr/diligence"))
    assert any(r["id"] == world.slip["eudr"] and r["status"] == "valide" for r in rows)
    assert world.p.get("hob.dg", f"/api/eudr/diligence/{world.slip['eudr']}")
    stems = world.p.get("hob.dg", f"/api/eudr/diligence/{world.slip['eudr']}/stems")
    assert stems
    _pdf(world, "hob.dg", f"/api/eudr/diligence/{world.slip['eudr']}/pdf")
    world.p.call("cfn.dg", "GET", f"/api/eudr/diligence/{world.slip['eudr']}", expect=(403, 404))


def test_conventions_communautaires_de_l_entreprise(world):
    """L'entreprise voit ses CCC actives et les communautés partenaires possibles."""
    agreements = _rows(world.p.get("hob.dg", "/api/community/agreements"))
    assert any(a.get("status") == "actif" for a in agreements)
    communities = _rows(world.p.get("hob.dg", "/api/community/communities"))
    assert any(c.get("id") == world.org["mas"] for c in communities)


def test_echeances_fiscales_de_l_entreprise(world):
    """L'entreprise voit ses échéances, réglées ou en retard, et pas celles des autres."""
    hob = _rows(world.p.get("hob.dg", "/api/taxes/dues"))
    assert hob and all(d.get("org_id") in (None, world.org["hob"]) for d in hob)
    cfn = _rows(world.p.get("cfn.dg", "/api/taxes/dues"))
    assert any(d.get("status") == "en_retard" for d in cfn)


def test_attestation_de_certification(world):
    """L'entreprise télécharge l'attestation de sa certification ; un tiers ne le peut pas."""
    certs = _rows(world.p.get("hob.dg", "/api/certifications"))
    fsc = next(c for c in certs if c["scheme"] == "FSC")
    _pdf(world, "hob.dg", f"/api/certifications/{fsc['id']}/pdf")
    world.p.call("cfn.dg", "GET", f"/api/certifications/{fsc['id']}/pdf", expect=(403, 404))
