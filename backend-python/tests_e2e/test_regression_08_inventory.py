"""Régression · inventaire d'exploitation importé d'un tableur (art. 60-62, 122, 124)."""

import io

from openpyxl import load_workbook

from tests_e2e.helpers import (
    declare,
    detail,
    inventory_csv,
    inventory_rows,
    inventory_upload,
    issue_codes,
    line,
)
from tools import seed_pilot

OKOUME = "Aucoumea klaineana"


def _registry(world, actor: str = "hob.dg") -> dict[str, dict]:
    return {t["tree_code"]: t for t in world.p.get(actor, "/api/felling/trees?status=inventorie")}


def test_l_inventaire_s_importe_avant_l_autorisation_d_exploiter(world):
    """L'inventaire d'exploitation précède le PAO : il s'importe sur une AAC sans autorisation délivrée (art. 62)."""
    out = inventory_upload(world, inventory_rows(world, [(OKOUME, 96, "abattre")]))
    assert out["can_confirm"] and out["summary"]["errors"] == 0


def test_une_aac_fermee_refuse_l_import(world):
    """Une AAC fermée refuse l'import de son inventaire."""
    out = inventory_upload(
        world, inventory_rows(world, [(OKOUME, 96, "abattre")], aac="hob0"), aac="hob0", expect=422
    )
    assert "AAC fermée" in detail(out)


def test_l_aac_d_une_autre_organisation_refuse_l_import(world):
    """Une entreprise ne peut pas importer l'inventaire de l'AAC d'une autre organisation."""
    out = inventory_upload(
        world, inventory_rows(world, [(OKOUME, 96, "abattre")]), actor="cfn.dg", expect=422
    )
    assert "autre organisation" in detail(out)


def test_une_tige_a_abattre_sous_le_dme_est_refusee(world):
    """Une tige à abattre sous le DME de l'UFA est une erreur à l'import (art. 124)."""
    out = inventory_upload(world, inventory_rows(world, [(OKOUME, 40, "abattre")]))
    assert "below_dme" in issue_codes(out)[0] and not out["can_confirm"]


def test_une_tige_d_avenir_sous_le_dme_est_acceptee(world):
    """Une tige d'avenir sous le DME est inventoriée sans erreur : elle sera préservée."""
    out = inventory_upload(world, inventory_rows(world, [(OKOUME, 40, "avenir")]))
    assert out["rows"][0]["level"] == "ok"


def test_une_essence_reservee_ne_s_inscrit_qu_en_reserve(world):
    """Une essence mise en réserve inscrite « abattre » est refusée ; inscrite « reserve », elle est acceptée."""
    out = inventory_upload(
        world,
        inventory_rows(
            world,
            [
                ("Baillonella toxisperma", 120, "abattre"),
                ("Baillonella toxisperma", 120, "reserve"),
            ],
        ),
    )
    codes = issue_codes(out)
    assert "reserved_species" in codes[0] and "reserved_species" not in codes[1]


def test_une_tige_sans_position_est_refusee(world):
    """Chaque tige doit être géolocalisée : une ligne sans latitude ou longitude est une erreur."""
    rows = inventory_rows(world, [(OKOUME, 96, "avenir")])
    rows[0]["latitude"] = ""
    out = inventory_upload(world, rows)
    assert "missing_position" in issue_codes(out)[0] and not out["can_confirm"]


def test_une_tige_hors_de_l_aac_est_refusee(world):
    """Une tige dont la position tombe hors du contour de l'AAC est une erreur."""
    rows = inventory_rows(world, [(OKOUME, 96, "abattre")], aac="hob1")
    out = inventory_upload(world, rows)
    assert "outside_aac" in issue_codes(out)[0]


def test_un_code_deja_au_registre_ou_repete_est_refuse(world):
    """Un code arbre déjà au registre, ou répété dans le fichier, est un doublon refusé."""
    rows = inventory_rows(world, [(OKOUME, 96, "abattre"), (OKOUME, 98, "abattre")])
    rows[1]["code_arbre"] = rows[0]["code_arbre"]
    existing = declare(world, [line(world, OKOUME, 95)])["lines_checked"][0]["tree_code"]
    rows.append({**inventory_rows(world, [(OKOUME, 97, "abattre")])[0], "code_arbre": existing})
    out = inventory_upload(world, rows)
    codes = issue_codes(out)
    assert "duplicate_code" not in codes[0]
    assert "duplicate_code" in codes[1] and "duplicate_code" in codes[2]


def test_la_confirmation_est_refusee_tant_qu_une_ligne_est_en_erreur(world):
    """L'import n'est confirmé que sans aucune ligne en erreur ; sinon rien n'est inscrit au registre."""
    rows = inventory_rows(world, [(OKOUME, 96, "abattre"), (OKOUME, 30, "abattre")])
    out = inventory_upload(world, rows, step="import", expect=422)
    assert "1 ligne(s) en erreur" in detail(out)
    assert rows[0]["code_arbre"] not in _registry(world)


def test_l_import_confirme_inscrit_chaque_tige_a_l_inventaire_de_l_aac(world):
    """L'import confirmé inscrit chaque tige « inventorié », rattachée à l'AAC, avec sa destination ; un code vide est attribué."""
    rows = inventory_rows(
        world, [(OKOUME, 96, "abattre"), (OKOUME, 50, "avenir"), ("Lophira alata", 80, "semencier")]
    )
    rows[2]["code_arbre"] = ""
    out = inventory_upload(world, rows, step="import", expect=201)
    created = out["import"]["tree_codes"]
    assert len(created) == 3 and created[2].startswith("GA-I")
    registry = _registry(world)
    assert registry[created[0]]["inventory_destination"] == "abattre"
    assert registry[created[1]]["inventory_destination"] == "avenir"
    assert all(registry[c]["aac_id"] == world.aac["hob2"] for c in created)


def test_un_arbre_a_preserver_ne_peut_jamais_etre_declare(world):
    """Un arbre inventorié à préserver (avenir, réserve, semencier) ne peut jamais être déclaré à l'abattage (art. 122)."""
    rows = inventory_rows(world, [(OKOUME, 95, "avenir")], aac="hob1", start=3)
    out = inventory_upload(world, rows, step="import", aac="hob1", expect=201)
    assert any(i["code"] == "aac_open" for i in out["file_issues"])
    tree = _registry(world)[rows[0]["code_arbre"]]
    refused = declare(
        world,
        [{**line(world, OKOUME, 95, i=3), "tree_code": tree["tree_code"]}],
        expect=422,
    )
    assert "kept_tree" in detail(refused)


def test_un_arbre_a_preserver_ne_peut_pas_etre_abattu(world):
    """Un arbre à préserver est refusé à l'abattage, quel que soit son statut (art. 122)."""
    rows = inventory_rows(world, [("Lophira alata", 90, "semencier")], aac="hob1", start=4)
    inventory_upload(world, rows, step="import", aac="hob1", expect=201)
    out = world.p.post(
        "hob.dg",
        "/api/felling/events",
        {"tree_code": rows[0]["code_arbre"], "event": "abattu"},
        expect=409,
    )
    assert "préserver" in detail(out)


def test_une_tige_importee_a_abattre_est_reprise_par_la_declaration(world):
    """Une tige importée « abattre » est reprise par la déclaration de l'entreprise sans être un doublon."""
    rows = inventory_rows(world, [(OKOUME, 99, "abattre")], aac="hob1", start=5)
    inventory_upload(world, rows, step="import", aac="hob1", expect=201)
    out = declare(world, [{**line(world, OKOUME, 99, i=5), "tree_code": rows[0]["code_arbre"]}])
    assert out["lines_checked"][0]["violations"] == []


def test_le_classeur_excel_et_la_virgule_decimale_sont_acceptes(world):
    """Le modèle Excel rempli s'importe : virgule décimale, valeurs en majuscules, feuille « Inventaire »."""
    wb = load_workbook(
        io.BytesIO(world.p.call("hob.dg", "GET", "/api/inventory/template.xlsx", expect=200))
    )
    assert wb.sheetnames == ["Inventaire", "Exemple", "Lisez-moi"]
    lon, lat = seed_pilot._point(world, "hob2", 6)
    wb["Inventaire"].append(
        [world.code(), "Okoumé", "96,5", None, str(lat).replace(".", ","), lon, "Abattre", "QR"]
    )
    buf = io.BytesIO()
    wb.save(buf)
    out = world.p.call(
        "hob.dg",
        "POST",
        f"/api/inventory/aacs/{world.aac['hob2']}/preview",
        files={"file": ("inventaire.xlsx", buf.getvalue())},
        expect=200,
    )
    assert out["format"] == "xlsx" and out["rows"][0]["dhp_cm"] == 96.5 and out["can_confirm"]


def test_un_fichier_au_dela_de_la_limite_de_lignes_est_refuse(world):
    """Un fichier de plus de 5 000 tiges est refusé : l'AAC se découpe en plusieurs fichiers."""
    row = inventory_rows(world, [(OKOUME, 96, "abattre")])[0]
    body = inventory_csv([{**row, "code_arbre": ""}] * 5001)
    out = world.p.call(
        "hob.dg",
        "POST",
        f"/api/inventory/aacs/{world.aac['hob2']}/preview",
        files={"file": ("gros.csv", body, "text/csv")},
        expect=413,
    )
    assert "5000" in detail(out)


def test_une_essence_cites_a_abattre_est_signalee_sans_bloquer(world):
    """Une essence CITES à abattre est signalée en avertissement ; l'import reste possible."""
    out = inventory_upload(world, inventory_rows(world, [("Afzelia bipindensis", 90, "abattre")]))
    assert "cites_listed" in issue_codes(out)[0] and out["can_confirm"]


def test_une_colonne_obligatoire_absente_refuse_le_fichier(world):
    """Un fichier sans une colonne obligatoire (ex. destination) est refusé avant toute vérification."""
    rows = inventory_rows(world, [(OKOUME, 96, "abattre")])
    body = inventory_csv(rows, head=("code_arbre", "essence", "dhp_cm", "latitude", "longitude"))
    out = world.p.call(
        "hob.dg",
        "POST",
        f"/api/inventory/aacs/{world.aac['hob2']}/preview",
        files={"file": ("sans_destination.csv", body, "text/csv")},
        expect=422,
    )
    assert "destination" in detail(out)
