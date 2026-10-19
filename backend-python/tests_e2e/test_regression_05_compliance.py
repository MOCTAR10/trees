"""Régression · pièces, fiscalité, certifications, études PPF/EIE, RDUE."""

from datetime import date, timedelta

from tools.seed_pilot import AAC_SITES, _square


def _d(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def test_type_de_piece_inconnu_refuse(world):
    """Un type de pièce absent du référentiel est refusé."""
    world.p.call(
        "gte.dg",
        "POST",
        "/api/documents/upload",
        json={"scope_type": "company", "scope_id": world.org["gte"], "doc_type": "inconnu_xyz"},
        expect=400,
    )


def test_piece_pour_une_autre_organisation_refusee(world):
    """Une entreprise ne dépose pas de pièce au nom d'une autre organisation."""
    world.p.call(
        "gte.dg",
        "POST",
        "/api/documents/upload",
        json={
            "scope_type": "company",
            "scope_id": world.org["hob"],
            "doc_type": "agrement_exploitation",
        },
        expect=(403, 404),
    )


def test_rejet_de_piece_motive_puis_redepot(world):
    """Une pièce rejetée l'est avec motif ; le redépôt la remet en instruction."""
    doc = world.p.post(
        "gte.dg",
        "/api/documents/upload",
        {
            "scope_type": "company",
            "scope_id": world.org["gte"],
            "doc_type": "agrement_exploitation",
            "reference": world.ref("REG-AGR"),
        },
        expect=(200, 201),
    )
    world.p.call(
        "admin", "PATCH", f"/api/documents/{doc['id']}", json={"status": "rejete"}, expect=400
    )
    world.p.patch(
        "admin", f"/api/documents/{doc['id']}", {"status": "rejete", "notes": "Signature absente"}
    )
    again = world.p.post(
        "gte.dg",
        "/api/documents/upload",
        {
            "scope_type": "company",
            "scope_id": world.org["gte"],
            "doc_type": "agrement_exploitation",
            "reference": world.ref("REG-AGR-2"),
        },
        expect=(200, 201),
    )
    assert again["status"] == "soumis"


def test_echeance_fiscale_reglee_par_quittance(world):
    """Une échéance fiscale se règle par une quittance enregistrée."""
    due = world.p.post(
        "admin",
        "/api/taxes/dues",
        {
            "title_id": world.title["hob"],
            "tax_type": "surveillance",
            "period_year": 2026,
            "amount_fcfa": 1_000_000,
            "due_at": _d(20),
        },
        expect=201,
    )
    out = world.p.post(
        "hob.dg",
        f"/api/taxes/dues/{due['id']}/settle",
        {"amount_fcfa": 1_000_000, "receipt_ref": world.ref("Q-REG")},
        expect=(200, 201),
    )
    assert out


def test_echeance_en_retard_dans_le_a_faire(world):
    """Une échéance fiscale dépassée apparaît dans le « À faire » (art. 283)."""
    kinds = {t["kind"] for t in world.p.get("cfn.dg", "/api/company/space")["todo"]}
    assert "tax" in kinds


def test_rejet_de_certification_sans_motif_refuse(world):
    """Rejeter une certification exige un motif."""
    cert = world.p.post(
        "gte.dg",
        "/api/certifications",
        {"scheme": "TLV", "cert_type": "legalite_plus", "certificate_ref": world.ref("TLV-REG")},
        expect=201,
    )
    world.p.call(
        "admin",
        "PATCH",
        f"/api/certifications/{cert['id']}",
        json={"decision": "rejete"},
        expect=400,
    )


def test_rejet_d_etude_sans_motif_refuse(world):
    """Rejeter une étude PPF/EIE exige un motif."""
    st = world.p.post(
        "hob.dg",
        f"/api/titles/{world.title['hob']}/studies",
        {"study_type": "eie", "reference": world.ref("EIE-REG")},
        expect=201,
    )
    world.p.call(
        "admin",
        "PATCH",
        f"/api/titles/{world.title['hob']}/studies/{st['id']}",
        json={"decision": "rejete"},
        expect=400,
    )


def test_rdue_compte_les_grumes_dans_la_parcelle(world):
    """La diligence RDUE confronte la souche de chaque grume au polygone de la parcelle."""
    dil = world.p.post(
        "hob.dg",
        "/api/eudr/diligence",
        {
            "title_id": world.title["hob"],
            "parcel_label": world.ref("REG-PARCELLE"),
            "parcel_wkt": _square(*AAC_SITES["hob1"]),
        },
        expect=201,
    )
    got = world.p.get("admin", f"/api/eudr/diligence/{dil['id']}")
    assert (got.get("inside_parcel_stem_count") or 0) >= 7
    assert (got.get("outside_parcel_stem_count") or 0) == 0


def test_rejet_de_diligence_sans_motif_refuse(world):
    """Rejeter une diligence RDUE exige un motif."""
    dil = world.p.post(
        "mas.chef",
        "/api/eudr/diligence",
        {"title_id": world.title["mas"], "parcel_label": world.ref("REG-FC")},
        expect=201,
    )
    world.p.call(
        "admin", "PATCH", f"/api/eudr/diligence/{dil['id']}", json={"status": "rejete"}, expect=400
    )


def test_echeance_reglee_deux_fois_refusee(world):
    """Une échéance déjà réglée ne peut pas l'être une seconde fois (409)."""
    due = world.p.post(
        "admin",
        "/api/taxes/dues",
        {"title_id": world.title["hob"], "tax_type": "abattage", "period_year": 2026,
         "amount_fcfa": 500_000, "due_at": _d(30)},
        expect=201,
    )
    world.p.post("hob.dg", f"/api/taxes/dues/{due['id']}/settle", {"amount_fcfa": 500_000}, expect=200)
    world.p.post(
        "hob.dg", f"/api/taxes/dues/{due['id']}/settle", {"amount_fcfa": 500_000}, expect=409
    )


def test_quittance_payee_regle_l_echeance(world):
    """Une quittance payée enregistrée par l'entreprise règle l'échéance correspondante (même titre, taxe, année)."""
    due = world.p.post(
        "admin",
        "/api/taxes/dues",
        {"title_id": world.title["hob"], "tax_type": "transformation", "period_year": 2025,
         "amount_fcfa": 250_000, "due_at": _d(30)},
        expect=201,
    )
    out = world.p.post(
        "hob.dg",
        "/api/taxes",
        {"tax_type": "transformation", "period_year": 2025, "amount_fcfa": 250_000,
         "paid_at": _d(0), "title_id": world.title["hob"]},
        expect=201,
    )
    assert out["settled_due_id"] == due["id"]
    dues = world.p.get("hob.dg", f"/api/taxes/dues?title_id={world.title['hob']}")
    assert {d["id"]: d["status"] for d in dues}[due["id"]] == "paye"
