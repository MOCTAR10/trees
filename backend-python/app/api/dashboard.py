"""Ministry dashboard: cross-cutting operational rollups (workflow §7.2 pt 7).

``GET /api/dashboard`` returns harvest volumes by species, the transformation
rate, the registry of titles/UFA/AAC, fiscal dues, community CCC/FDL,
transport activity and certifications. Exposed as JSON for the mobile admin
view and as a branded PDF for reporting.
"""

from fastapi import APIRouter, Depends, Response

from app.core.deps import require_roles
from app.services import dashboard, pdf_report

router = APIRouter()


@router.get("")
async def overview(admin: dict = Depends(require_roles("admin"))):
    return await dashboard.overview()


@router.get("/pdf")
async def overview_pdf(admin: dict = Depends(require_roles("admin"))):
    data = await dashboard.overview()
    pdf = pdf_report.render_dashboard_pdf(data)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="tableau_de_bord.pdf"'},
    )
