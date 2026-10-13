"""Rattache les comptes legacy (``company`` / ``cooperative``) à une organization.

Les comptes créés avant le registre ``organizations`` n'ont pas
d'``organization_id`` : ils ne reposent sur aucune entité légale distincte.
Ce script leur crée/lie une organisation, de façon **idempotente** et en
traçant le compte d'origine (``organizations.legacy_user_id``).

Usage (depuis le conteneur API) ::

    python -m tools.backfill_organizations
"""

from __future__ import annotations

import argparse
import asyncio

from app.services import db, org_backfill


async def run() -> None:
    try:
        orphans = await org_backfill.list_orphans()
        print(f"Comptes sans organization : {len(orphans)}")
        for user in orphans:
            label = user.get("email") or user.get("display_name")
            print(f"  #{user['id']} {user['role']:11} {label}")

        result = await org_backfill.backfill()
        print(
            f"Organisations creees : {result['created_count']} · "
            f"comptes rattaches : {result['linked_count']}"
        )
        for org in result["created"]:
            print(f"  org #{org['id']} ({org['org_type']}) — {org['name']}")
    finally:
        await db.close_pool()


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    asyncio.run(run())


if __name__ == "__main__":
    main()
