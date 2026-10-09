"""Startup bootstrap: ensure the configured admin account exists."""

import logging

from app.config import get_settings
from app.core import security
from app.services import db

logger = logging.getLogger(__name__)


async def ensure_admin() -> None:
    """Create the admin user from ADMIN_EMAIL/ADMIN_PASSWORD if missing."""
    settings = get_settings()
    email = settings.admin_email.strip()
    password = settings.admin_password
    if not email or not password:
        return

    existing = await db.fetch_one("SELECT id FROM users WHERE email=$1", email)
    if existing is not None:
        return

    await db.execute(
        """
        INSERT INTO users (email, display_name, role, password_hash)
        VALUES ($1, $2, 'admin', $3)
        """,
        email,
        settings.admin_display_name,
        security.hash_password(password),
    )
    logger.info("Bootstrap admin account created: %s", email)
