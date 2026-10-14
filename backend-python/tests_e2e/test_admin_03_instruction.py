"""Régression Ministère · déclarations, pièces, fiscalité, social, certifications, RDUE."""

from tests_e2e.helpers import declare, line


def _pdf(world, path):
    out = world.p.call("admin", "GET", path, expect=200, note=f"PDF {path}")
    assert bytes(out).startswith(b"%PDF"), path


def _rows(payload):
    return payload.get("items", payload) if isinstance(payload, dict) else payload


def test_liste_et_detail_des_declarations(world):
    """Le Ministère liste les déclarations et en consulte une avec ses lignes."""
    rows = _rows(world.p.get("admin", "/api/felling/declarations"))
    assert any(d["id"] == world.decl["d1"] for d in rows)
    d1 = world.p.get("admin", f"/api/felling/declarations/{world.decl['d1']}")
    body = d1.get("declaration", d1)
    assert body["status"] == "autorisee"


def test_evaluation_de_conformite_d_une_declaration(world):
    """L'évaluation de conformité d'une déclaration distingue blocages et avertissements."""
    ev = world.p.get("admin", f"/api/compliance/felling/{world.decl['d3']}")
    assert "warnings" in ev or "blockers" in ev or "hard" in ev


def test_plaques_qr_d_une_declaration(world):
    """Les plaques QR d'une déclaration s'impriment en PDF."""
    _pdf(world, f"/api/felling/declarations/{world.decl['d1']}/plates.pdf")


def test_registre_des_arbres_vu_par_le_ministere(world):
    """Le Ministère voit le registre de tous les arbres, avec leur statut."""
    codes = {t["tree_code"] for t in world.p.get("admin", "/api/felling/trees")}
    assert set(world.trees["d1"]) <= codes


def test_anomalies_d_abattage(world):
    """Le contrôle des anomalies d'abattage répond pour le Ministère."""
    assert world.p.get("admin", "/api/felling/anomalies") is not None


def test_pieces_en_instruction_et_types(world):
    """Le Ministère voit les pièces déposées et le référentiel des types (autorité, validité)."""
    docs = _rows(world.p.get("admin", "/api/documents"))
    assert any(d.get("status") == "soumis" for d in docs)
    types = world.p.get("admin", "/api/documents/types")
    assert len(types) >= 38 and all("authority" in t for t in types)


def test_validation_d_une_piece_visible_par_l_entreprise(world):
    """Une pièce validée par le Ministère apparaît « valide » côté entreprise."""
    checklist = world.p.get("gte.dg", "/api/documents/checklist")
    items = checklist.get("items", checklist) if isinstance(checklist, dict) else checklist
    code = next(c.get("doc_type") or c.get("code") for c in items)
    doc = world.p.post(
        "gte.dg",
        "/api/documents/upload",
        {
            "scope_type": "company",
            "scope_id": world.org["gte"],
            "doc_type": code,
            "reference": world.ref("REG-NEG"),
            "expires_at": "2030-01-01",
        },
        expect=(200, 201),
    )
    world.p.patch("admin", f"/api/documents/{doc['id']}", {"status": "valide", "notes": "Conforme"})
    mine = _rows(world.p.get("gte.dg", "/api/organizations/me/documents"))
    assert any(d.get("id") == doc["id"] and d.get("status") == "valide" for d in mine)


def test_quittances_echeances_et_statut(world):
    """Le Ministère suit quittances et échéances et peut corriger le statut d'une quittance."""
    tax = world.p.post(
        "hob.dg",
        "/api/taxes",
        {
            "tax_type": "abattage",
            "period_year": 2026,
            "amount_fcfa": 250_000,
            "receipt_ref": world.ref(f"Q-{world.code()}"),
            "title_id": world.title["hob"],
        },
        expect=201,
    )
    world.p.patch("admin", f"/api/taxes/{tax['id']}", {"status": "en_retard"})
    assert any(
        t["id"] == tax["id"] and t["status"] == "en_retard"
        for t in _rows(world.p.get("hob.dg", "/api/taxes"))
    )
    world.p.call("admin", "PATCH", "/api/taxes/99999999", json={"status": "paye"}, expect=404)
    assert any(t["id"] == tax["id"] for t in _rows(world.p.get("admin", "/api/taxes")))
    dues = _rows(world.p.get("admin", "/api/taxes/dues"))
    assert any(d.get("status") == "en_retard" for d in dues)


def test_conventions_communautaires_et_fdl(world):
    """Le Ministère voit les CCC, les communautés et la synthèse FDL."""
    agreements = _rows(world.p.get("admin", "/api/community/agreements"))
    assert any(a.get("status") == "actif" for a in agreements)
    assert world.p.get("admin", "/api/community/agreements/summary")
    assert _rows(world.p.get("admin", "/api/community/communities"))


def test_certifications_liste_synthese_pdf(world):
    """Le Ministère liste les certifications, en voit la synthèse et le PDF."""
    certs = _rows(world.p.get("admin", "/api/certifications"))
    fsc = next(
        c
        for c in certs
        if c.get("scheme") == "FSC" and f"{world.ns}" in (c.get("certificate_ref") or "")
    )
    assert world.p.get("admin", "/api/certifications/summary")
    _pdf(world, f"/api/certifications/{fsc['id']}/pdf")


def test_suspension_de_certification_visible_par_l_entreprise(world):
    """Une certification suspendue (motif) apparaît suspendue côté entreprise."""
    cert = world.p.post(
        "gte.dg",
        "/api/certifications",
        {
            "scheme": "PAFC",
            "cert_type": "gestion_durable",
            "certificate_ref": world.ref(f"PAFC-{world.code()}"),
        },
        expect=201,
    )
    world.p.patch("admin", f"/api/certifications/{cert['id']}", {"decision": "actif"})
    world.p.patch(
        "admin",
        f"/api/certifications/{cert['id']}",
        {"decision": "suspendu", "decision_motif": "Audit de surveillance non conforme"},
    )
    mine = _rows(world.p.get("gte.dg", "/api/certifications"))
    assert any(c["id"] == cert["id"] and c["status"] == "suspendu" for c in mine)


def test_diligences_rdue_liste_et_pdf(world):
    """Le Ministère liste les diligences RDUE et produit l'attestation PDF."""
    rows = _rows(world.p.get("admin", "/api/eudr/diligence"))
    assert any(r["id"] == world.slip["eudr"] for r in rows)
    _pdf(world, f"/api/eudr/diligence/{world.slip['eudr']}/pdf")


def test_declaration_rejetee_lisible_par_l_entreprise(world):
    """Le motif d'un rejet de déclaration est lisible par l'entreprise."""
    out = declare(world, [line(world, "Aucoumea klaineana", 95)])
    world.p.post(
        "admin",
        f"/api/admin/inbox/declarations/{out['id']}/decision",
        {"approve": False, "motif": "Coordonnées à reprendre"},
        expect=200,
    )
    mine = _rows(world.p.get("hob.dg", "/api/felling/declarations"))
    got = next(d for d in mine if d["id"] == out["id"])
    assert got["status"] == "rejetee" and got["decision_motif"] == "Coordonnées à reprendre"
