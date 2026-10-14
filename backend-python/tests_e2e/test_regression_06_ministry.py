"""Régression · contrôles terrain et PV, échéances, vues du Ministère et des entreprises."""

from datetime import date

from tests_e2e.helpers import felled_trees


def test_controle_non_conforme_exige_un_constat(world):
    """Un contrôle non conforme ou avec réserves exige un constat écrit."""
    code = felled_trees(world)[0]
    world.p.call(
        "mef.brigade",
        "POST",
        "/api/controls",
        json={"control_type": "marquage", "result": "reserve", "tree_code": code},
        expect=400,
    )


def test_controle_exige_son_objet(world):
    """Chaque type de contrôle exige son objet (arbre, AAC, organisation)."""
    for body in (
        {"control_type": "marquage", "result": "conforme"},
        {"control_type": "visa_df10", "result": "conforme"},
        {"control_type": "transformation", "result": "conforme"},
    ):
        world.p.call("mef.brigade", "POST", "/api/controls", json=body, expect=422)


def test_controle_releve_les_verifications_et_produit_un_pv(world):
    """Le contrôle relève les vérifications automatiques ; son PV est un PDF."""
    code = felled_trees(world)[0]
    look = world.p.get("mef.brigade", f"/api/controls/lookup?code={code}")
    assert look["kind"] == "tree" and look["checks"]
    ctl = world.p.post(
        "mef.brigade",
        "/api/controls",
        {
            "control_type": "marquage",
            "result": "conforme",
            "tree_code": code,
            "pv_reference": world.ref("PV-REG"),
        },
        expect=201,
    )
    pdf = world.p.call("mef.brigade", "GET", f"/api/controls/{ctl['id']}/pdf", expect=200)
    assert bytes(pdf).startswith(b"%PDF")
    world.p.call("hob.dg", "GET", f"/api/controls/{ctl['id']}/pdf", expect=200)
    world.p.call("cfn.dg", "GET", f"/api/controls/{ctl['id']}/pdf", expect=403)


def test_code_inconnu_signale(world):
    """Un code inconnu du registre et des bordereaux est signalé en rouge."""
    look = world.p.get("mef.brigade", "/api/controls/lookup?code=INCONNU-0000")
    assert look["kind"] == "unknown" and look["checks"][0]["level"] == "ko"


def test_etat_annuel_une_seule_fois_et_annee_close(world):
    """L'état annuel se transmet une seule fois, pour une année close."""
    world.p.call(
        "cfn.dg",
        "POST",
        "/api/traceability/statements/file",
        json={"year": date.today().year},
        expect=400,
    )
    world.p.post(
        "cfn.dg", "/api/traceability/statements/file", {"year": date.today().year - 1}, expect=201
    )
    world.p.call(
        "cfn.dg",
        "POST",
        "/api/traceability/statements/file",
        json={"year": date.today().year - 1},
        expect=409,
    )


def test_registre_des_anomalies_couvre_les_familles_du_pilote(world):
    """Le registre relève les irrégularités du pilote (contrôle, fiscalité, pièces, échéances)."""
    tag = f"[{world.ns}]"
    types = {
        a["type"]
        for a in world.p.get("admin", "/api/anomalies")
        if tag in (a.get("org_name") or "")
    }
    assert {
        "controle_non_conforme",
        "taxes_impayees",
        "documents_expires",
        "etat_annuel_non_transmis",
        "aac_ouverture_depassee",
    } <= types


def test_revue_d_anomalie_motivee(world):
    """Le Ministère traite ou écarte une anomalie avec un motif."""
    tag = f"[{world.ns}]"
    a = next(
        a
        for a in world.p.get("admin", "/api/anomalies")
        if tag in (a.get("org_name") or "") and a["review_status"] == "ouverte"
    )
    world.p.post(
        "admin",
        "/api/anomalies/review",
        {
            "anomaly_type": a["type"],
            "subject_key": a["subject_key"],
            "status": "traitee",
            "decision_motif": "Suivi par la Direction Provinciale",
            "org_id": a.get("org_id"),
        },
        expect=201,
    )


def test_boussole_des_autorites(world):
    """La boussole liste les 8 parties prenantes, toutes « interface à venir »."""
    rows = world.p.get("admin", "/api/admin/authorities")["authorities"]
    assert {r["code"] for r in rows} == {
        "DGF",
        "DP",
        "DGFAP",
        "DGE",
        "ANPN",
        "DGICBVPF",
        "DGI",
        "DOUANES",
    }
    assert all(r["interface"] == "a_venir" for r in rows)


def test_chaque_dossier_porte_sa_competence(world):
    """Chaque dossier en attente indique l'autorité compétente et le Ministère agissant."""
    items = world.p.get("admin", "/api/admin/inbox/items")
    assert items and all(i.get("acting_authority") == "Ministère des Eaux et Forêts" for i in items)
    assert all(i.get("competence_note") for i in items)


def test_tableau_de_bord_et_provinces(world):
    """Le tableau de bord et le résumé par province répondent avec des données."""
    dash = world.p.get("admin", "/api/dashboard")
    assert dash["harvest"] and dash["titles"]
    provinces = {p["code"] for p in world.p.get("admin", "/api/admin/provinces")}
    assert {"GA-2", "GA-5", "GA-6"} <= provinces


def test_a_faire_de_l_usine(world):
    """L'usine voit ses bordereaux entrants et ses grumes à transformer."""
    kinds = {t["kind"] for t in world.p.get("sdl.dg", "/api/company/space")["todo"]}
    assert {"slip_incoming", "to_process"} <= kinds


def test_decisions_recues_avec_motif(world):
    """L'entreprise voit les décisions du Ministère avec leur motif."""
    decisions = world.p.get("hob.dg", "/api/company/space")["decisions"]
    rejects = [d for d in decisions if d["outcome"] == "rejet"]
    assert rejects and all(d["motif"] for d in rejects)
