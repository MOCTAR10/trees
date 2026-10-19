"""Régression Ministère · modèle d'import d'inventaire et historique des imports."""

from tests_e2e.helpers import inventory_rows, inventory_upload


def test_le_ministere_lit_le_modele_d_import_propose(world):
    """Le Ministère lit le modèle de colonnes proposé et télécharge les deux modèles de fichier."""
    model = world.p.get("mef.dp2", "/api/inventory/model")
    assert model["version"] and all(c["legal"] for c in model["columns"])
    assert bytes(
        world.p.call("mef.dp2", "GET", "/api/inventory/template.xlsx", expect=200)
    ).startswith(b"PK")
    assert world.p.call("mef.dp2", "GET", "/api/inventory/template.csv", expect=200)


def test_le_ministere_voit_les_imports_sur_la_fiche_de_l_organisation(world):
    """Chaque import confirmé (qui, quand, fichier, nombres) apparaît au Ministère sur la fiche de l'organisation."""
    rows = inventory_rows(world, [("Aucoumea klaineana", 97, "oui")], start=14)
    out = inventory_upload(world, rows, step="import", expect=201)
    sheet = world.p.get("mef.dp2", f"/api/organizations/{world.org['hob']}/sheet")
    entry = next(i for i in sheet["inventory_imports"] if i["id"] == out["import"]["id"])
    assert entry["imported_by"] == world.user["hob.dg"] and entry["rows_total"] == 1
    listed = world.p.get("mef.dp2", f"/api/inventory/imports?organization_id={world.org['hob']}")
    assert any(i["id"] == entry["id"] for i in listed)
    pdf = world.p.call(
        "mef.dp2", "GET", f"/api/inventory/imports/{entry['id']}/plates.pdf", expect=200
    )
    assert bytes(pdf).startswith(b"%PDF")
    assert world.p.call(
        "mef.dp2", "POST", f"/api/inventory/aacs/{world.aac['hob2']}/preview", expect=403
    )
