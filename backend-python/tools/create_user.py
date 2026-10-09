"""Create (or list) RBAC user accounts from the command line.

Handy for bootstrapping when the admin account is not configured via
``ADMIN_EMAIL``/``ADMIN_PASSWORD``, or for onboarding companies/cooperatives.

Usage::

    python -m tools.create_user --list
    python -m tools.create_user --email co@x --password s3cret --role company
    python -m tools.create_user --email coop@x --password s3cret \
        --role cooperative --cooperative-id 4
"""

from __future__ import annotations

import argparse
import asyncio

from app.core import security
from app.services import db

VALID_ROLES = {"operator", "cooperative", "company", "admin"}


async def _list() -> None:
    rows = await db.fetch_all(
        "SELECT id, email, display_name, role, is_active FROM users ORDER BY id"
    )
    if not rows:
        print("(no users)")
        return
    for row in rows:
        print(
            f"{row['id']:>4}  {row['role']:<12} {row['email']:<32} "
            f"active={row['is_active']}  {row['display_name']}"
        )


async def _create(args: argparse.Namespace) -> None:
    if args.role not in VALID_ROLES:
        raise SystemExit(f"invalid role {args.role!r}; choose from {sorted(VALID_ROLES)}")
    if args.role == "cooperative" and args.cooperative_id is None:
        raise SystemExit("--cooperative-id is required for the 'cooperative' role")

    existing = await db.fetch_one("SELECT id FROM users WHERE email=$1", args.email)
    if existing:
        raise SystemExit(f"user {args.email!r} already exists (id={existing['id']})")

    if args.cooperative_id is not None:
        coop = await db.fetch_one(
            "SELECT id FROM community_cooperatives WHERE id=$1", args.cooperative_id
        )
        if coop is None:
            raise SystemExit(f"cooperative {args.cooperative_id} not found")
    if args.company_id is not None:
        company = await db.fetch_one("SELECT id FROM users WHERE id=$1", args.company_id)
        if company is None:
            raise SystemExit(f"company user {args.company_id} not found")

    row = await db.fetch_one(
        """
        INSERT INTO users (email, display_name, role, password_hash,
                           cooperative_id, company_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, email, role
        """,
        args.email,
        args.name or args.email,
        args.role,
        security.hash_password(args.password),
        args.cooperative_id,
        args.company_id,
        not args.inactive,
    )
    print(f"created user id={row['id']} email={row['email']} role={row['role']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create/list RBAC users.")
    parser.add_argument("--list", action="store_true", help="list existing users")
    parser.add_argument("--email")
    parser.add_argument("--name", default="", help="display name (defaults to email)")
    parser.add_argument("--password")
    parser.add_argument("--role", default="operator")
    parser.add_argument("--cooperative-id", type=int)
    parser.add_argument("--company-id", type=int)
    parser.add_argument("--inactive", action="store_true")
    args = parser.parse_args()

    async def run() -> None:
        try:
            if args.list:
                await _list()
            else:
                if not args.email or not args.password:
                    raise SystemExit("--email and --password are required")
                await _create(args)
        finally:
            await db.close_pool()

    asyncio.run(run())


if __name__ == "__main__":
    main()
