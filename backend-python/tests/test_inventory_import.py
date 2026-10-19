"""Inventory import from a spreadsheet (Slice 31) — parsing, row checks, templates, access."""

import asyncio
import io
from datetime import date

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.config import get_settings
from app.core import inventory_model as model
from app.core import security
from app.main import app
from app.services import compliance, db, dme, inventory_import

AAC = {
    "id": 7,
    "label": "AAC 2026-2",
    "status": "soumis",
    "ufa_id": 3,
    "has_geom": True,
    "ufa_label": "UFA 1",
    "title_id": 2,
    "title_reference": "CFAD-01",
    "holder_org_id": 10,
}

HEAD = "code_arbre;essence;dhp_cm;latitude;longitude;destination;marquage;numero_peint"


def _csv(*lines: str, head: str = HEAD) -> bytes:
    return ("\n".join([head, *lines]) + "\n").encode("utf-8")


@pytest.fixture
def fake_rules(monkeypatch):
    state = {"outside": set(), "taken": set(), "painted": set(), "spatial": {}, "ufa_dme": {}}

    async def outside(_aac_id, points):
        return {p[0] for p in points if p[0] in state["outside"]}

    async def spatial(points):
        return {p[0]: state["spatial"][p[0]] for p in points if p[0] in state["spatial"]}

    async def fetch_all(sql, *args):
        if "painted_number = any" in sql.lower():
            return [{"painted_number": n} for n in args[1] if n in state["painted"]]
        if "tree_code = any" in sql.lower():
            return [{"tree_code": c} for c in args[0] if c in state["taken"]]
        return []

    async def ufa_map(_ufa_id):
        return state["ufa_dme"]

    monkeypatch.setattr(compliance, "lines_outside_aac", outside)
    monkeypatch.setattr(compliance, "lines_spatial_context", spatial)
    monkeypatch.setattr(dme, "map_for_ufa", ufa_map)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    return state


def _analyse(content: bytes, name: str = "inv.csv", aac: dict | None = None) -> dict:
    result, _rows = asyncio.run(inventory_import.analyse(aac or AAC, name, content))
    return result


def _codes(result: dict) -> list[list[str]]:
    return [[i["code"] for i in r["issues"]] for r in result["rows"]]


def test_numbers_accept_decimal_comma_and_spaces():
    assert inventory_import.parse_number("87,5") == 87.5
    assert inventory_import.parse_number("-0,6912") == -0.6912
    assert inventory_import.parse_number("1 234,5") == 1234.5
    assert inventory_import.parse_number("1.234,5") == 1234.5
    assert inventory_import.parse_number("1,234.5") == 1234.5
    assert inventory_import.parse_number(96) == 96.0
    assert inventory_import.parse_number("abc") is None
    assert inventory_import.parse_number("nan") is None


def test_dates_in_french_or_iso_format():
    assert inventory_import.parse_date("14/02/2026") == date(2026, 2, 14)
    assert inventory_import.parse_date("2026-02-14") == date(2026, 2, 14)
    assert inventory_import.parse_date("31/02/2026") is None


def test_headers_matched_by_name_alias_case_and_accents():
    mapping, ignored = inventory_import._header_map(
        ["Code", "Espèce", "DHP (cm)", "Lat", "Longitude", "Destination", "Couleur"]
    )
    assert set(mapping.values()) == {
        "code_arbre",
        "essence",
        "dhp_cm",
        "latitude",
        "longitude",
        "destination",
    }
    assert ignored == ["Couleur"]


def test_csv_separator_and_windows_encoding_detected(fake_rules):
    body = (
        "code_arbre,essence,dhp_cm,latitude,longitude,destination\n,Okoumé,96,-0.77,13.64,abattre\n"
    )
    result = _analyse(body.encode("cp1252"))
    assert result["rows"][0]["essence"] == "Okoumé" and result["can_confirm"]
    tab = _analyse(
        _csv(
            ";Okoumé;96;-0,77;13,64;abattre", head=HEAD.replace(";marquage;numero_peint", "")
        ).replace(b";", b"\t")
    )
    assert tab["rows"][0]["dhp_cm"] == 96


def test_missing_required_column_refuses_the_file(fake_rules):
    with pytest.raises(inventory_import.ImportFileError, match="destination"):
        _analyse(
            _csv(";Okoumé;96;-0,77;13,64", head="code_arbre;essence;dhp_cm;latitude;longitude")
        )


def test_row_limit_and_file_size(fake_rules, monkeypatch):
    monkeypatch.setattr(model, "MAX_ROWS", 2)
    with pytest.raises(inventory_import.ImportFileError) as err:
        _analyse(_csv(*[";Okoumé;96;-0,77;13,64;abattre;;"] * 3))
    assert err.value.status == 413
    monkeypatch.setattr(model, "MAX_FILE_BYTES", 10)
    with pytest.raises(inventory_import.ImportFileError, match="volumineux"):
        _analyse(_csv(";Okoumé;96;-0,77;13,64;abattre;;"))


def test_old_excel_format_is_refused():
    with pytest.raises(inventory_import.ImportFileError) as err:
        inventory_import.read_table("inventaire.xls", b"\xd0\xcf\x11\xe0rest")
    assert err.value.status == 415


def test_row_rules(fake_rules):
    fake_rules["ufa_dme"] = {"Aucoumea klaineana": {"dme_cm": 75, "source": "arrêté"}}
    fake_rules["outside"] = {"GA-OUT-1"}
    fake_rules["taken"] = {"GA-DUP-1"}
    result = _analyse(
        _csv(
            ";Okoumé;96;-0,77;13,64;abattre;qr;",
            ";Okoumé;60;-0,77;13,64;abattre;qr;",
            ";Okoumé;60;-0,77;13,64;avenir;qr;",
            ";Moabi;120;-0,77;13,64;abattre;qr;",
            ";Moabi;120;-0,77;13,64;reserve;qr;",
            ";Okoumé;96;;13,64;semencier;qr;",
            "GA-OUT-1;Okoumé;96;-0,77;13,64;abattre;qr;",
            "GA-DUP-1;Okoumé;96;-0,77;13,64;abattre;qr;",
            ";Okoumé;96;-0,77;13,64;abattre;peinture;",
            ";Okoumé;abc;-0,77;13,64;coupe;qr;",
            ";Arbre inconnu;96;-0,77;13,64;abattre;qr;",
            "GA-I12-00001;Okoumé;96;-0,77;13,64;abattre;qr;",
            ";Okoumé;96;-95;13,64;abattre;qr;",
        )
    )
    codes = _codes(result)
    assert codes[0] == []
    assert codes[1] == ["below_dme"] and result["rows"][1]["dme_cm"] == 75
    assert codes[2] == []
    assert "reserved_species" in codes[3]
    assert codes[4] == []
    assert codes[5] == ["missing_position"]
    assert codes[6] == ["outside_aac"]
    assert codes[7] == ["duplicate_code"]
    assert codes[8] == ["painted_number_required"]
    assert set(codes[9]) == {"invalid_number", "invalid_value"}
    assert codes[10] == ["unknown_species"] and result["rows"][10]["level"] == "warning"
    assert codes[11] == ["reserved_code"]
    assert codes[12] == ["invalid_position"]
    assert result["summary"]["kept"] == 3 and not result["can_confirm"]


def test_duplicates_inside_the_file(fake_rules):
    fake_rules["painted"] = {"7"}
    result = _analyse(
        _csv(
            "GA-A-001;Okoumé;96;-0,77;13,64;abattre;qr;1",
            "GA-A-001;Okoumé;96;-0,77;13,64;abattre;qr;2",
            "GA-A-003;Okoumé;96;-0,77;13,64;abattre;qr;2",
            "GA-A-004;Okoumé;96;-0,77;13,64;abattre;qr;7",
        )
    )
    codes = _codes(result)
    assert codes[0] == [] and codes[1] == ["duplicate_code"]
    assert codes[2] == ["duplicate_painted_number"] and codes[3] == ["duplicate_painted_number"]


def test_warnings_do_not_block(fake_rules):
    fake_rules["spatial"] = {"#ligne2": {"protected_area": "Parc", "outside_concession": True}}
    result = _analyse(
        _csv(
            ";Okoumé;96;-0,77;13,64;abattre;qr;",
            ";Afzelia bipindensis;90;-0,77;13,64;abattre;qr;",
            ";Afzelia bipindensis;90;-0,77;13,64;reserve;qr;",
        )
    )
    codes = _codes(result)
    assert set(codes[0]) == {"in_protected_area", "outside_concession"}
    assert codes[1] == ["cites_listed"] and codes[2] == []
    assert result["can_confirm"]


def test_file_level_warnings(fake_rules):
    result = _analyse(
        _csv(";Okoumé;96;-0,77;13,64;abattre;qr;", head=HEAD + ";couleur"),
        aac={**AAC, "status": "ouvert", "has_geom": False},
    )
    assert {i["code"] for i in result["file_issues"]} == {
        "aac_open",
        "aac_without_geometry",
        "ignored_column",
    }


def test_future_date_and_unusable_quality(fake_rules):
    head = HEAD + ";qualite;date_releve"
    result = _analyse(
        _csv(
            ";Okoumé;96;-0,77;13,64;abattre;qr;;3;01/01/2099",
            ";Okoumé;96;-0,77;13,64;avenir;qr;;3;14/02/2026",
            head=head,
        )
    )
    codes = _codes(result)
    assert set(codes[0]) == {"future_date", "unusable_quality"} and codes[1] == []


def test_xlsx_template_has_three_sheets_and_reads_back(fake_rules):
    content = inventory_import.template_xlsx()
    wb = load_workbook(io.BytesIO(content))
    assert wb.sheetnames == ["Inventaire", "Exemple", "Lisez-moi"]
    assert [c.value for c in wb["Inventaire"][1]] == [c.key for c in model.COLUMNS]
    readme = [r[0] for r in wb["Lisez-moi"].iter_rows(values_only=True)]
    assert all(c.key in readme for c in model.COLUMNS)
    with pytest.raises(inventory_import.ImportFileError, match="Aucune tige"):
        _analyse(content, "modele.xlsx")
    wb["Inventaire"].append([None, "Okoumé", 96.5, None, -0.77, 13.64, "Abattre"])
    buf = io.BytesIO()
    wb.save(buf)
    result = _analyse(buf.getvalue(), "inventaire.xlsx")
    assert (
        result["format"] == "xlsx" and result["rows"][0]["dhp_cm"] == 96.5 and result["can_confirm"]
    )


def test_csv_template_uses_semicolon_bom_and_decimal_comma(fake_rules):
    content = inventory_import.template_csv()
    assert content.startswith(b"\xef\xbb\xbfcode_arbre;essence;dhp_cm")
    assert b"87,5" in content
    result = _analyse(content)
    assert result["summary"]["rows"] == len(inventory_import.EXAMPLE_ROWS)
    assert result["summary"]["kept"] == 3


ROLE_IDS = {"admin": 1, "company": 2, "operator": 4, "cooperative": 6}


def _token(role: str) -> dict:
    uid = ROLE_IDS[role]
    token = security.create_access_token(f"{role}@x", role, uid, get_settings().jwt_secret, 3600)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(monkeypatch):
    async def fetch_one(sql, *args):
        if "from users" in sql.lower():
            return {
                "id": args[0],
                "email": "co@x",
                "role": next(r for r, i in ROLE_IDS.items() if i == args[0]),
                "is_active": True,
                "organization_id": 10,
                "company_id": None,
                "cooperative_id": None,
                "display_name": "Co",
            }
        return None

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    return TestClient(app)


def test_model_and_templates_open_to_company_and_ministry_only(client):
    assert (
        client.get("/api/inventory/model", headers=_token("company")).json()["max_rows"]
        == model.MAX_ROWS
    )
    assert client.get("/api/inventory/template.xlsx", headers=_token("admin")).content.startswith(
        b"PK"
    )
    for role in ("operator", "cooperative"):
        assert client.get("/api/inventory/model", headers=_token(role)).status_code == 403
        assert client.get("/api/inventory/template.csv", headers=_token(role)).status_code == 403


def test_preview_refused_on_closed_aac_but_allowed_without_authorization(
    client, monkeypatch, fake_rules
):
    async def context(_aac_id):
        return AAC

    gates = {"value": "aac_closed"}

    async def gate(_aac_id, _org):
        return gates["value"]

    monkeypatch.setattr(inventory_import, "aac_context", context)
    monkeypatch.setattr(compliance, "authorization_gate", gate)
    files = {"file": ("inv.csv", _csv(";Okoumé;96;-0,77;13,64;abattre;qr;"), "text/csv")}
    resp = client.post("/api/inventory/aacs/7/preview", files=files, headers=_token("company"))
    assert resp.status_code == 422 and resp.json()["detail"]["code"] == "aac_closed"
    gates["value"] = "no_authorization"
    resp = client.post("/api/inventory/aacs/7/preview", files=files, headers=_token("company"))
    assert resp.status_code == 200 and resp.json()["can_confirm"]
    resp = client.post("/api/inventory/aacs/7/preview", files=files, headers=_token("admin"))
    assert resp.status_code == 403


def test_confirm_refused_while_a_row_is_in_error(client, monkeypatch, fake_rules):
    async def context(_aac_id):
        return AAC

    async def gate(_aac_id, _org):
        return None

    monkeypatch.setattr(inventory_import, "aac_context", context)
    monkeypatch.setattr(compliance, "inventory_gate", gate)
    files = {"file": ("inv.csv", _csv(";Okoumé;96;;;abattre;qr;"), "text/csv")}
    resp = client.post("/api/inventory/aacs/7/import", files=files, headers=_token("company"))
    assert resp.status_code == 422
    assert resp.json()["detail"]["rows"][0]["issues"][0]["code"] == "missing_position"


def test_inventory_gate_ignores_missing_authorization(monkeypatch):
    async def gate(_aac_id, _org):
        return gates.pop(0)

    gates = ["no_authorization", "startup_not_notified", "aac_closed", "title_not_exploitable"]
    monkeypatch.setattr(compliance, "authorization_gate", gate)
    results = [asyncio.run(compliance.inventory_gate(1, 1)) for _ in range(4)]
    assert results == [None, None, "aac_closed", "title_not_exploitable"]
