"""Régression Entreprise · import de l'inventaire d'exploitation d'une AAC."""

from tests_e2e.helpers import inventory_rows, inventory_upload


def test_l_entreprise_telecharge_le_modele_et_lit_le_guide(world):
    """L'entreprise lit le modèle de colonnes et télécharge le modèle Excel et CSV."""
    model = world.p.get("hob.dg", "/api/inventory/model")
    assert model["max_rows"] == 5000 and any(c["key"] == "a_abattre" for c in model["columns"])
    xlsx = world.p.call("hob.dg", "GET", "/api/inventory/template.xlsx", expect=200)
    assert bytes(xlsx).startswith(b"PK")
    csv = world.p.call("hob.dg", "GET", "/api/inventory/template.csv", expect=200)
    assert bytes(csv).decode("utf-8-sig").startswith("reference_aac;numero_arbre;essence")


def test_l_entreprise_importe_son_inventaire_et_imprime_les_plaques(world):
    """L'entreprise prévisualise, confirme l'import, retrouve l'import dans son historique et imprime les plaques du lot."""
    rows = inventory_rows(
        world,
        [("Aucoumea klaineana", 96, "oui"), ("Aucoumea klaineana", 50, "non")],
        start=12,
    )
    preview = inventory_upload(world, rows)
    assert preview["summary"] == {
        "rows": 2,
        "ok": 2,
        "warnings": 0,
        "errors": 0,
        "to_fell": 1,
        "kept": 1,
    }
    out = inventory_upload(world, rows, step="import", expect=201)
    imports = world.p.get("hob.dg", "/api/inventory/imports")
    mine = next(i for i in imports if i["id"] == out["import"]["id"])
    assert (
        mine["stems_created"] == 2
        and mine["kept_count"] == 1
        and mine["file_name"] == "inventaire.csv"
    )
    pdf = world.p.call(
        "hob.dg", "GET", f"/api/inventory/imports/{mine['id']}/plates.pdf", expect=200
    )
    assert bytes(pdf).startswith(b"%PDF")
    other = world.p.call(
        "sdl.dg", "GET", f"/api/inventory/imports/{mine['id']}/plates.pdf", expect=403
    )
    assert other
    assert all(
        i["organization_id"] == world.org["sdl"]
        for i in world.p.get("sdl.dg", "/api/inventory/imports")
    )
