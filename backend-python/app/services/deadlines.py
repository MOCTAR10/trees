"""Legal deadlines, derived at read time from dates already in the database.

* An AAC may stay open **3 years** at most (Loi 016/01, art. 121) — counted from
  ``annual_cut_blocks.opened_at``.
* The **annual statement** of year *Y* is due on **31 March of Y+1** (art. 244).
  It is owed by every holder of a title in force before 1 January of *Y+1*
  (grant date, else creation date) and by any organisation that felled in *Y*;
  a filing is a row of ``statement_filings``.
* Authorisations and legal documents nearing their end date are announced.

Durations are the law's; the notice windows are settings — *à valider par le métier*.
"""

from datetime import date, timedelta

from app.services import db

AAC_MAX_OPEN_YEARS = 3
AAC_NOTICE_DAYS = 90
STATEMENT_DUE_MONTH_DAY = (3, 31)
AUTHORIZATION_NOTICE_DAYS = 30
DOCUMENT_NOTICE_DAYS = 60


def statement_due(year: int) -> date:
    """Deadline of the annual statement of ``year``."""
    month, day = STATEMENT_DUE_MONTH_DAY
    return date(year + 1, month, day)


def aac_deadline(opened_at) -> date | None:
    if opened_at is None:
        return None
    start = opened_at.date() if hasattr(opened_at, "date") else opened_at
    try:
        return start.replace(year=start.year + AAC_MAX_OPEN_YEARS)
    except ValueError:
        return start.replace(year=start.year + AAC_MAX_OPEN_YEARS, day=28)


_OPEN_AAC_SQL = """
SELECT b.id, b.label, b.opened_at, t.holder_org_id AS org_id, o.name AS org_name,
       t.id AS title_id, t.reference AS title_ref
FROM annual_cut_blocks b
JOIN management_units u ON u.id = b.ufa_id
JOIN forest_titles t ON t.id = u.title_id
LEFT JOIN organizations o ON o.id = t.holder_org_id
WHERE b.status = 'ouvert' AND b.opened_at IS NOT NULL
  AND ($1::int IS NULL OR t.holder_org_id = $1)
"""


async def aac_open_too_long(org_id: int | None = None, today: date | None = None) -> list[dict]:
    """Open AAC past (``overdue``) or near (``soon``) their 3-year limit."""
    today = today or date.today()
    out = []
    for r in await db.fetch_all(_OPEN_AAC_SQL, org_id):
        deadline = aac_deadline(r["opened_at"])
        if deadline is None or deadline - timedelta(days=AAC_NOTICE_DAYS) > today:
            continue
        out.append({**dict(r), "deadline": deadline, "overdue": deadline < today})
    return out


_OWES_SQL = """
SELECT o.id AS org_id, o.name AS org_name
FROM organizations o
WHERE o.is_active AND ($2::int IS NULL OR o.id = $2)
  AND (
    EXISTS (
      SELECT 1 FROM forest_titles t
      WHERE t.holder_org_id = o.id AND t.status IN ('provisoire', 'actif')
        AND COALESCE(t.grant_date, t.created_at::date) < make_date($1 + 1, 1, 1))
    OR EXISTS (
      SELECT 1 FROM tree_registry r
      LEFT JOIN users u ON u.id = r.company_id
      WHERE COALESCE(r.custodian_org_id, u.organization_id) = o.id
        AND r.felled_at IS NOT NULL AND extract(year FROM r.felled_at) = $1)
  )
  AND NOT EXISTS (
    SELECT 1 FROM statement_filings f
    WHERE f.org_id = o.id AND f.period_year = $1 AND f.period_kind = 'annuel')
"""


async def statements_missing(org_id: int | None = None, today: date | None = None) -> list[dict]:
    """Last year's annual statement, owed and not filed (overdue after 31 March)."""
    today = today or date.today()
    year = today.year - 1
    due = statement_due(year)
    rows = await db.fetch_all(_OWES_SQL, year, org_id)
    return [{**dict(r), "year": year, "due": due, "overdue": due < today} for r in rows]


async def authorizations_expiring(org_id: int, today: date | None = None) -> list[dict]:
    today = today or date.today()
    rows = await db.fetch_all(
        """
        SELECT a.id, a.authorization_type, a.valid_to, b.label AS aac_label
        FROM aac_authorizations a
        JOIN annual_cut_blocks b ON b.id = a.aac_id
        JOIN management_units u ON u.id = b.ufa_id
        JOIN forest_titles t ON t.id = u.title_id
        WHERE t.holder_org_id = $1 AND a.status = 'delivre' AND b.status IN ('autorise', 'ouvert')
          AND a.valid_to IS NOT NULL AND a.valid_to BETWEEN $2 AND $3
        """,
        org_id,
        today,
        today + timedelta(days=AUTHORIZATION_NOTICE_DAYS),
    )
    return [dict(r) for r in rows]


async def documents_expiring(org_id: int, today: date | None = None) -> list[dict]:
    today = today or date.today()
    rows = await db.fetch_all(
        """
        SELECT ld.id, ld.doc_type, COALESCE(dt.label, ld.doc_type) AS label, ld.expires_at
        FROM legal_documents ld
        LEFT JOIN document_types dt ON dt.code = ld.doc_type
        WHERE ld.scope_type = 'company' AND ld.scope_id = $1 AND ld.status = 'valide'
          AND ld.expires_at IS NOT NULL AND ld.expires_at BETWEEN $2 AND $3
        """,
        org_id,
        today,
        today + timedelta(days=DOCUMENT_NOTICE_DAYS),
    )
    return [dict(r) for r in rows]
