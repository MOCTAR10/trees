"""End-to-end workflow suite: the pilot story on a real PostgreSQL/PostGIS.

The session builds the complete pilot dataset in a throw-away namespace through
the API (every step asserts its expected status), the tests check what each role
then sees, and the namespace is deleted afterwards. Skipped when no database is
reachable. ``E2E_BASE_URL`` targets a running API over HTTP instead of in-process;
``E2E_KEEP=1`` keeps the data for inspection.
"""

import os
import uuid

import pytest

from tools import seed_pilot
from tools.pilot_client import Pilot, sql


def _database_up() -> bool:
    try:
        sql([("SELECT 1 AS ok", ())])
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def world():
    if not _database_up():
        pytest.skip("PostgreSQL injoignable : suite de bout en bout ignorée")
    ns = os.environ.get("E2E_NS") or f"E2E{uuid.uuid4().hex[:6].upper()}"
    p = Pilot.connect(os.environ.get("E2E_BASE_URL"))
    try:
        ctx = seed_pilot.build(p, ns)
        yield ctx
    finally:
        p.close()
        if not os.environ.get("E2E_KEEP"):
            seed_pilot.reset(ns)


@pytest.fixture(scope="session")
def p(world):
    return world.p
