"""End-to-end workflow suite: the pilot story on a real PostgreSQL/PostGIS.

The session builds the complete pilot dataset in a throw-away namespace through
the API (every step asserts its expected status), the tests check what each role
then sees, and the namespace is deleted afterwards. Skipped when no database is
reachable. ``E2E_BASE_URL`` targets a running API over HTTP instead of in-process;
``E2E_KEEP=1`` keeps the data for inspection; ``E2E_REPORT=path.json`` writes
the step log (and a Markdown summary). ``PILOT_API_KEY`` is sent as ``X-API-Key``.
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
    ctx = None
    try:
        ctx = seed_pilot.build(p, ns)
        yield ctx
    finally:
        if os.environ.get("E2E_REPORT"):
            p.report(
                os.environ["E2E_REPORT"],
                f"Suite de bout en bout « {ns} »",
                ctx.log if ctx else ["construction interrompue"],
            )
        p.close()
        if not os.environ.get("E2E_KEEP"):
            seed_pilot.reset(ns)


@pytest.fixture(scope="session")
def p(world):
    return world.p


def pytest_collection_modifyitems(items):
    """Carry each test's rule (its docstring) into the JUnit report."""
    for item in items:
        doc = (getattr(item.function, "__doc__", None) or "").strip().splitlines()
        if doc:
            item.user_properties.append(("regle", doc[0]))
