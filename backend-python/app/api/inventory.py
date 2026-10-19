"""Exploitation inventory of an AAC imported from a spreadsheet (Slice 31).

The company downloads the template, uploads the filled file for a preview (every
row checked, nothing written), then confirms: the stems enter the registry
(``inventorie``) tied to the AAC, and the QR plates of the batch can be printed.
The Ministry reads the model, the templates and every organisation's imports.
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

from app.config import get_settings
from app.core import inventory_model as model
from app.core.deps import require_roles
from app.services import compliance, db, inventory_import, plate_print

router = APIRouter()

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _company_id(user: dict) -> int | None:
    company_id = user.get("company_id")
    if company_id is None and user["role"] == "company":
        company_id = user["id"]
    return company_id


@router.get("/model")
async def import_model(_user: dict = Depends(require_roles("company", "admin"))):
    """Columns of the inventory file (required, format, example, legal basis)."""
    return model.describe()


@router.get("/template.xlsx")
async def template_xlsx(_user: dict = Depends(require_roles("company", "admin"))):
    """Excel template: « Inventaire » to fill, « Exemple », « Lisez-moi »."""
    return Response(
        content=inventory_import.template_xlsx(),
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": 'attachment; filename="modele_inventaire_aac.xlsx"'},
    )


@router.get("/template.csv")
async def template_csv(_user: dict = Depends(require_roles("company", "admin"))):
    """CSV template (``;`` separator, decimal comma), with one example per destination."""
    return Response(
        content=inventory_import.template_csv(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="modele_inventaire_aac.csv"'},
    )


async def _checked(aac_id: int, user: dict, file: UploadFile):
    aac = await inventory_import.aac_context(aac_id)
    if aac is None:
        raise HTTPException(status_code=404, detail="AAC introuvable")
    gate = await compliance.inventory_gate(aac_id, user.get("organization_id"))
    if gate is not None:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Import refusé — {compliance.GATE_LABELS.get(gate, gate)}",
                "code": gate,
            },
        )
    content = await file.read(model.MAX_FILE_BYTES + 1)
    try:
        return aac, *await inventory_import.analyse(aac, file.filename or "inventaire", content)
    except inventory_import.ImportFileError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.post("/aacs/{aac_id}/preview")
async def preview_import(
    aac_id: int,
    file: UploadFile = File(...),
    user: dict = Depends(require_roles("company")),
):
    """Dry run: every row checked against the registry rules; nothing is written."""
    _aac, result, _rows = await _checked(aac_id, user, file)
    return result


@router.post("/aacs/{aac_id}/import", status_code=201)
async def confirm_import(
    aac_id: int,
    file: UploadFile = File(...),
    user: dict = Depends(require_roles("company")),
):
    """Enter every stem of the file in the registry — refused while a row is in error."""
    aac, result, rows = await _checked(aac_id, user, file)
    if not result["can_confirm"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Import refusé — {result['summary']['errors']} ligne(s) en erreur",
                "summary": result["summary"],
                "rows": [r for r in result["rows"] if r["level"] == "error"][:200],
            },
        )
    created = await inventory_import.confirm(aac, user, _company_id(user), result, rows)
    return {**result, "import": created}


@router.get("/imports")
async def list_imports(
    organization_id: int | None = Query(None),
    user: dict = Depends(require_roles("company", "admin")),
):
    """Audit trail of the confirmed imports (the company's own; any for the Ministry)."""
    if user["role"] == "admin":
        return await inventory_import.list_imports(organization_id)
    if user.get("organization_id") is None:
        return []
    return await inventory_import.list_imports(user["organization_id"])


@router.get("/imports/{import_id}/plates.pdf")
async def import_plates(
    import_id: int,
    user: dict = Depends(require_roles("company", "admin")),
):
    """QR plates of every stem of an import (to fell and to preserve)."""
    header = await db.fetch_one(
        "SELECT id, organization_id FROM inventory_imports WHERE id = $1", import_id
    )
    if header is None:
        raise HTTPException(status_code=404, detail="Import introuvable")
    if user["role"] != "admin" and header["organization_id"] != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Import d'une autre organisation")
    rows = await db.fetch_all(
        "SELECT tree_code FROM tree_registry WHERE inventory_import_id = $1 ORDER BY id",
        import_id,
    )
    codes = [r["tree_code"] for r in rows]
    if not codes:
        raise HTTPException(status_code=404, detail="Aucune tige dans cet import")
    pdf = plate_print.plates_pdf_bytes(codes, get_settings().qr_tag_size_cm)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="plaques_inventaire_{import_id}.pdf"'
        },
    )
