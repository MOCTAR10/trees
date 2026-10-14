"""Régression Ministère · traçabilité, transport, contrôles, anomalies, rapports."""

from tests_e2e.helpers import felled_trees, slip


def _pdf(world, path):
    out = world.p.call("admin", "GET", path, expect=200, note=f"PDF {path}")
    assert bytes(out).startswith(b"%PDF"), path


def _rows(payload):
    return payload.get("items", payload) if isinstance(payload, dict) else payload


def test_carnet_df10_et_son_pdf(world):
    """Le Ministère consulte le carnet DF10 et son PDF."""
    rows = _rows(world.p.get("admin", "/api/traceability/df10"))
    assert any(r.get("df10_entry_no") for r in rows)
    _pdf(world, "/api/traceability/df10/pdf")


def test_etats_periodiques_et_leur_pdf(world):
    """Le Ministère consulte les états de production d'une année et leur PDF."""
    year = 2026
    st = world.p.get("admin", f"/api/traceability/statements?year={year}")
    assert st["totals"]["stems_felled"] >= 1
    _pdf(world, f"/api/traceability/statements/pdf?year={year}")


def test_etats_annuels_transmis_vus_par_le_ministere(world):
    """Le Ministère voit les états annuels transmis par toutes les organisations."""
    filings = world.p.get("admin", "/api/traceability/filings")
    assert any(f"[{world.ns}]" in f["org_name"] for f in filings)


def test_bordereaux_liste_detail_pdf(world):
    """Le Ministère liste les bordereaux, en consulte un avec ses grumes et son PDF."""
    docs = _rows(world.p.get("admin", "/api/transport/documents"))
    assert any(d["id"] == world.slip["t1"] for d in docs)
    detail = world.p.get("admin", f"/api/transport/documents/{world.slip['t1']}")
    assert len(detail["trees"]) == 3
    _pdf(world, f"/api/transport/documents/{world.slip['t1']}/pdf")


def test_le_ministere_peut_reguler_un_bordereau(world):
    """Le Ministère peut émettre et réceptionner un bordereau bloqué (régularisation)."""
    code = felled_trees(world)[0]
    doc = slip(world, [code])
    world.p.patch("admin", f"/api/transport/documents/{doc['id']}", {"status": "emis"})
    world.p.patch("admin", f"/api/transport/documents/{doc['id']}", {"status": "receptionne"})
    tree = world.p.get("admin", f"/api/felling/trees/{code}")
    assert tree["status"] == "receptionne" and tree["custodian_name"]


def test_fiche_grume_pour_le_ministere(world):
    """Le Ministère consulte toute grume, sans action à enregistrer à sa place."""
    tree = world.p.get("admin", f"/api/felling/trees/{world.trees['d1'][0]}")
    assert tree["history"] and tree["next_event"] is None


def test_liste_des_controles_filtrable(world):
    """Le Ministère filtre ses contrôles par type et par résultat ; chacun porte sa compétence."""
    rows = world.p.get("admin", "/api/controls?type=marquage&result=non_conforme")
    assert rows and all(
        r["control_type"] == "marquage" and r["result"] == "non_conforme" for r in rows
    )
    assert all(r.get("competence_note") for r in rows)


def test_registre_des_anomalies_synthese_et_pdf(world):
    """Le registre des anomalies a sa synthèse par famille et son PDF."""
    summary = world.p.get("admin", "/api/anomalies/summary")
    assert summary.get("by_type") or summary.get("total") is not None
    _pdf(world, "/api/anomalies/pdf")


def test_filtres_du_registre_des_anomalies(world):
    """Le registre se filtre par famille et par gravité."""
    hard = world.p.get("admin", "/api/anomalies?severity=hard")
    assert hard and all(a["severity"] == "hard" for a in hard)
    one = world.p.get("admin", "/api/anomalies?type=controle_non_conforme")
    assert one and all(a["type"] == "controle_non_conforme" for a in one)


def test_tableau_de_bord_pdf(world):
    """Le tableau de bord national s'exporte en PDF."""
    _pdf(world, "/api/dashboard/pdf")


def test_files_par_type_et_par_province(world):
    """« À traiter » se filtre par type de dossier et par province."""
    decl = world.p.get("admin", "/api/admin/inbox/items?type=declarations")
    assert decl and all(i["type"] == "declarations" for i in decl)
    ga2 = world.p.get("admin", "/api/admin/inbox/items?province=GA-2")
    assert ga2 and all(i.get("province_code") == "GA-2" for i in ga2)
