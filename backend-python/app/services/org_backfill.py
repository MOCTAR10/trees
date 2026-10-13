"""Rattachement des comptes legacy aux organisations (Slice 13).

Avant le registre ``organizations``, un compte ``company`` / ``cooperative``
*était* l'entité légale : il porte l'auto-référence ``users.company_id`` vers
``users.id`` et aucun ``organization_id``. Ces deux opérations, partagées par
l'endpoint Ministère (``/api/organizations``) et la CLI d'exploitation
(``python -m tools.backfill_organizations``), listent ces comptes puis leur
créent une organisation réelle de façon **idempotente** et **auditable**
(``organizations.legacy_user_id``).
"""

from app.services import db

#: Rôles dont le compte était l'entité légale, candidats au rattachement.
ORPHAN_ROLES: tuple[str, ...] = ("company", "cooperative")

_ORPHANS_SELECT = (
    "SELECT id, email, display_name, role, created_at"
    " FROM users"
    " WHERE role = ANY($1::text[]) AND is_active AND organization_id IS NULL"
    " ORDER BY role, id"
)

#: Insère l'organisation propre à chaque compte non rattaché. Le profil suit
#: l'``org_type`` (l'entreprise prend ``exploitant_forestier`` par défaut ; aucune
#: presse coopérative n'existe encore → profil ``NULL``, à préciser par le métier).
_BACKFILL_INSERT = """
INSERT INTO organizations (org_type, name, profile_code, legacy_user_id)
SELECT
    CASE WHEN u.role = 'cooperative' THEN 'cooperative' ELSE 'entreprise' END,
    COALESCE(NULLIF(u.display_name, ''), u.email, 'Compte ' || u.id),
    CASE WHEN u.role = 'cooperative' THEN NULL
         ELSE (SELECT p.code FROM org_profiles p
               WHERE p.org_type = 'entreprise'
               ORDER BY (p.code = 'exploitant_forestier') DESC, p.code
               LIMIT 1)
    END,
    u.id
FROM users u
WHERE u.role = ANY($1::text[])
  AND u.is_active
  AND u.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.legacy_user_id = u.id)
ON CONFLICT (legacy_user_id) DO NOTHING
RETURNING id, org_type, name, legacy_user_id
"""

_BACKFILL_LINK = """
UPDATE users u
SET organization_id = o.id
FROM organizations o
WHERE o.legacy_user_id = u.id
  AND u.organization_id IS NULL
RETURNING u.id, u.email, o.id AS organization_id
"""


async def list_orphans() -> list[dict]:
    """Comptes ``company`` / ``cooperative`` actifs encore sans organisation."""
    rows = await db.fetch_all(_ORPHANS_SELECT, list(ORPHAN_ROLES))
    return [dict(r) for r in rows]


async def backfill() -> dict:
    """Crée + rattache une organisation par compte legacy non rattaché.

    Idempotent : un compte déjà lié à une organisation est ignoré, et
    ``ON CONFLICT (legacy_user_id)`` empêche toute seconde organisation pour le
    même compte d'origine.
    """
    created = await db.fetch_all(_BACKFILL_INSERT, list(ORPHAN_ROLES))
    linked = await db.fetch_all(_BACKFILL_LINK)
    return {
        "created": [dict(r) for r in created],
        "linked": [dict(r) for r in linked],
        "created_count": len(created),
        "linked_count": len(linked),
    }
