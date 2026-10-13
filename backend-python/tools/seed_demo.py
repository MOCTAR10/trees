"""Seed a coherent demo dataset for the Ministère walkthrough.

Creates one integrated logging company (``CFAD`` -> ``UFA`` -> ``AAC``), a
community forest with a ``CCC``, harvest activity (felled / transported /
transformed stems), a transport document, fiscal receipts and dues, and a
certification -- enough to light up every panel of
``/api/dashboard`` and to trigger **all nine** anomaly families of
``app.services.anomalies``.

Idempotent: it first removes its own rows (identified by the ``DEMO`` naming
and the ``GA-DEMO-`` tree-code prefix) and then re-inserts them, so it can be
re-run at will. Nothing outside these markers is touched.

Usage (from inside the API container)::

    python -m tools.seed_demo
"""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import UTC, date, datetime, timedelta

from app.core import security
from app.core.dme import dme_for
from app.core.log_volume import merchantable_volume_m3
from app.services import db

# --------------------------------------------------------------------------
# Markers -- everything the tool owns is derivable from these.
# --------------------------------------------------------------------------
COMPANY_EMAIL = "company.demo@forestry.local"
COMPANY_PASSWORD = "Demo12345"
COMPANY_NAME = "Société Forestière Démo (CFAD)"
COMMUNITY_NAME = "Communauté Villageoise Démo (Mikongo)"

TITLE_REF = "DEMO-CFAD-01"
FC_REF = "DEMO-FC-01"
UFA_LABEL = "UFA Démo 1"
AAC_OPEN_LABEL = "DEMO-AAC-2026-01"
AAC_CLOSED_LABEL = "DEMO-AAC-2026-02"
TREE_PREFIX = "GA-DEMO-"

#: Official DME/UFA values seeded for the demo UFA (Loi 016/01 art. 124):
#: ``(scientific name, dme_cm, source)``. They replace the provisional default
#: and demonstrate the per-UFA audit origin in the felling compliance gate.
SEEDED_UFA_DME: tuple[tuple[str, float, str], ...] = (
    ("Aucoumea klaineana", 75.0, "Arrêté 0001/MEF — DME UFA Démo 1"),
)

TODAY = date.today()

#: Conventions seeded for the demo CFAD (Loi 016/01): the convention
#: provisoire that followed the CPAET, then the convention définitive (~15 ans)
#: and the attestation de conformité issued by the Ministry. Signed_at defaults
#: to start_date; the attestation is dated relative to today. Cascades with the
#: title, so re-running the seed stays idempotent.
SEEDED_CONVENTIONS: tuple[dict, ...] = (
    {
        "convention_type": "provisoire",
        "reference": "DEMO-CONV-PROV-01",
        "start_date": TODAY - timedelta(days=1080),
        "end_date": TODAY - timedelta(days=200),
        "attestation_ref": None,
    },
    {
        "convention_type": "definitive",
        "reference": "DEMO-CONV-DEF-01",
        "start_date": TODAY - timedelta(days=200),
        "end_date": TODAY + timedelta(days=365 * 15),
        "attestation_ref": "DEMO-ATT-01",
    },
)

#: Anomaly families this dataset is designed to trigger. Kept as an explicit
#: contract (asserted in the test-suite) so a detector added later cannot be
#: silently left out of the demo.
SEEDED_ANOMALY_TYPES = frozenset(
    {
        "below_dme",
        "felled_without_authorization",
        "abattage_hors_aac",
        "espece_reservee",
        "aac_fermee",
        "documents_expires",
        "taxes_impayees",
        "cites_sans_permis",
        "transport_sans_bordereau",
    }
)

#: (tree_code suffix, scientific name, DBH cm, registry status) for the demo
#: stems that populate the dashboard harvest rollup.
STEMS: tuple[tuple[str, str, float, str], ...] = (
    ("001", "Aucoumea klaineana", 55.0, "abattu"),  # below DME (70)
    ("002", "Baillonella toxisperma", 110.0, "abattu"),  # reserved species
    ("003", "Pterocarpus soyauxii", 90.0, "abattu"),  # outside AAC
    ("004", "Entandrophragma cylindricum", 95.0, "abattu"),  # CITES, no permit
    ("005", "Aucoumea klaineana", 110.0, "abattu"),  # compliant
    ("006", "Terminalia superba", 100.0, "abattu"),  # declared on a closed AAC
    ("007", "Entandrophragma utile", 85.0, "transforme"),  # no bordereau
    ("008", "Milicia excelsa", 90.0, "transforme"),  # no bordereau
    ("009", "Lophira alata", 80.0, "transporte"),  # no bordereau
    ("010", "Dacryodes glaucescens", 75.0, "transporte"),  # covered by bordereau
)


def _code(suffix: str) -> str:
    return f"{TREE_PREFIX}{suffix}"


async def _one(sql: str, *args):
    return await db.fetch_one(sql, *args)


async def _reset(company_id: int, org_ids: list[int]) -> None:
    """Delete previously-seeded demo rows, in FK-safe order."""
    titles = [
        r["id"]
        for r in await db.fetch_all("SELECT id FROM forest_titles WHERE reference LIKE 'DEMO-%'")
    ]
    ufas = [
        r["id"]
        for r in await db.fetch_all(
            "SELECT id FROM management_units WHERE title_id = ANY($1::int[])", titles
        )
    ]
    aacs = [
        r["id"]
        for r in await db.fetch_all(
            "SELECT id FROM annual_cut_blocks WHERE ufa_id = ANY($1::int[])", ufas
        )
    ]

    await db.execute("DELETE FROM anomaly_reviews WHERE subject_key LIKE $1", f"{TREE_PREFIX}%")
    await db.execute(
        "DELETE FROM declaration_lines WHERE declaration_id IN"
        " (SELECT id FROM felling_declarations WHERE company_id = $1 OR title_id = ANY($2::int[]))",
        company_id,
        titles,
    )
    await db.execute(
        "DELETE FROM felling_declarations WHERE company_id = $1 OR title_id = ANY($2::int[])",
        company_id,
        titles,
    )
    await db.execute("DELETE FROM custody_events WHERE tree_code LIKE $1", f"{TREE_PREFIX}%")
    await db.execute("DELETE FROM tree_registry WHERE tree_code LIKE $1", f"{TREE_PREFIX}%")
    await db.execute("DELETE FROM transport_documents WHERE org_id = ANY($1::int[])", org_ids)
    await db.execute("DELETE FROM tax_dues WHERE org_id = ANY($1::int[])", org_ids)
    await db.execute("DELETE FROM tax_receipts WHERE org_id = ANY($1::int[])", org_ids)
    await db.execute("DELETE FROM eudr_diligence WHERE org_id = ANY($1::int[])", org_ids)
    await db.execute("DELETE FROM certifications WHERE org_id = ANY($1::int[])", org_ids)
    await db.execute(
        "DELETE FROM community_agreements WHERE title_id = ANY($1::int[])"
        " OR community_org_id = ANY($2::int[])",
        titles,
        org_ids,
    )
    await db.execute("DELETE FROM aac_authorizations WHERE aac_id = ANY($1::int[])", aacs)
    await db.execute("DELETE FROM title_conventions WHERE title_id = ANY($1::int[])", titles)
    await db.execute("DELETE FROM annual_cut_blocks WHERE ufa_id = ANY($1::int[])", ufas)
    await db.execute("DELETE FROM management_units WHERE title_id = ANY($1::int[])", titles)
    await db.execute(
        "DELETE FROM legal_documents WHERE"
        " (scope_type = 'company' AND scope_id = ANY($1::int[]))"
        " OR (scope_type = 'title' AND scope_id = ANY($2::int[]))"
        " OR (scope_type = 'aac' AND scope_id = ANY($3::int[]))"
        " OR (scope_type = 'ufa' AND scope_id = ANY($4::int[]))",
        org_ids,
        titles,
        aacs,
        ufas,
    )
    await db.execute("DELETE FROM forest_titles WHERE reference LIKE 'DEMO-%'")


async def _org(name: str, org_type: str, profile_code: str, admin_id: int) -> int:
    row = await _one("SELECT id FROM organizations WHERE name = $1 ORDER BY id LIMIT 1", name)
    if row:
        await db.execute(
            "UPDATE organizations SET org_type = $2, profile_code = $3, is_active = TRUE"
            " WHERE id = $1",
            row["id"],
            org_type,
            profile_code,
        )
        return row["id"]
    row = await _one(
        "INSERT INTO organizations (org_type, name, profile_code, created_by)"
        " VALUES ($1, $2, $3, $4) RETURNING id",
        org_type,
        name,
        profile_code,
        admin_id,
    )
    return row["id"]


async def _company_user(org_id: int) -> int:
    row = await _one("SELECT id FROM users WHERE email = $1", COMPANY_EMAIL)
    if row:
        await db.execute(
            "UPDATE users SET display_name = $2, role = 'company', organization_id = $3,"
            " is_active = TRUE, password_hash = $4 WHERE id = $1",
            row["id"],
            COMPANY_NAME,
            org_id,
            security.hash_password(COMPANY_PASSWORD),
        )
        return row["id"]
    row = await _one(
        "INSERT INTO users (email, display_name, role, password_hash, organization_id)"
        " VALUES ($1, $2, 'company', $3, $4) RETURNING id",
        COMPANY_EMAIL,
        COMPANY_NAME,
        security.hash_password(COMPANY_PASSWORD),
        org_id,
    )
    return row["id"]


async def _insert_title(
    title_type: str, reference: str, holder: int, zone: str, surface: float, admin_id: int
) -> int:
    row = await _one(
        "INSERT INTO forest_titles"
        " (title_type, reference, holder_org_id, zone, surface_ha, status,"
        "  pa_approved_at, grant_ref, grant_date, created_by, decided_by, decided_at)"
        " VALUES ($1, $2, $3, $4, $5, 'actif', $6, $7, $6, $8, $8, now())"
        " RETURNING id",
        title_type,
        reference,
        holder,
        zone,
        surface,
        TODAY - timedelta(days=200),
        f"{reference}-G",
        admin_id,
    )
    return row["id"]


async def _insert_aac(
    ufa_id: int, label: str, surface: float, possibility: float, status: str
) -> int:
    row = await _one(
        "INSERT INTO annual_cut_blocks"
        " (ufa_id, label, campaign_year, surface_ha, possibility_m3, origin, status,"
        "  pao_reference, pao_submitted_at)"
        " VALUES ($1, $2, $3, $4, $5, 'plan_amenagement', $6, $7, now()) RETURNING id",
        ufa_id,
        label,
        TODAY.year,
        surface,
        possibility,
        status,
        f"{label}-PAO",
    )
    return row["id"]


async def _insert_doc(
    scope_type: str,
    scope_id: int,
    doc_type: str,
    reference: str,
    expires_at: date | None,
    status: str,
    actor: int,
) -> None:
    await db.execute(
        "INSERT INTO legal_documents"
        " (scope_type, scope_id, doc_type, reference, issued_at, expires_at, status,"
        "  submitted_by, verified_by, verified_at)"
        " VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, now())",
        scope_type,
        scope_id,
        doc_type,
        reference,
        TODAY - timedelta(days=300),
        expires_at,
        status,
        actor,
    )


async def _insert_declaration(
    company_id: int,
    title_id: int,
    aac_id: int,
    reference: str,
    lines: list[tuple[str, str, float, list[str]]],
    admin_id: int,
) -> None:
    decl = await _one(
        "INSERT INTO felling_declarations"
        " (company_id, permit_type, permit_number, ufa_label, aac_label, campaign_year,"
        "  status, title_id, aac_id, decided_by, decided_at)"
        " VALUES ($1, 'CFAD', $2, $3, $4, $5, 'autorisee', $6, $7, $8, now())"
        " RETURNING id",
        company_id,
        reference,
        UFA_LABEL,
        reference,
        TODAY.year,
        title_id,
        aac_id,
        admin_id,
    )
    for raw, species, dbh, violations in lines:
        code = _code(raw)
        dme = dme_for(species)[0]
        await db.execute(
            "INSERT INTO declaration_lines"
            " (declaration_id, tree_code, species_scientific_name, measured_dbh_cm, dme_cm,"
            "  violations)"
            " VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
            decl["id"],
            code,
            species,
            dbh,
            dme,
            json.dumps(violations),
        )


async def seed() -> None:
    admin = await _one("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    if admin is None:
        raise SystemExit("no admin account found; start the API to bootstrap one first")
    admin_id = admin["id"]

    company_org = await _org(COMPANY_NAME, "entreprise", "integre", admin_id)
    community_org = await _org(COMMUNITY_NAME, "communaute", "foret_communautaire", admin_id)
    org_ids = [company_org, community_org]
    company_id = await _company_user(company_org)

    await _reset(company_id, org_ids)

    # --- Titles / UFA / AAC -------------------------------------------------
    title_id = await _insert_title("CFAD", TITLE_REF, company_org, "permanent", 60_000.0, admin_id)
    fc_id = await _insert_title("FC", FC_REF, community_org, "rural", 5_000.0, admin_id)

    ufa = await _one(
        "INSERT INTO management_units"
        " (title_id, label, surface_ha, plan_amenagement_ref, pa_approved_at, pa_expiry,"
        "  rotation_years)"
        " VALUES ($1, $2, $3, $4, $5, $6, 25) RETURNING id",
        title_id,
        UFA_LABEL,
        60_000.0,
        "DEMO-PA-01",
        TODAY - timedelta(days=200),
        TODAY + timedelta(days=365 * 5),
    )
    aac_open = await _insert_aac(ufa["id"], AAC_OPEN_LABEL, 5_000.0, 15_000.0, "ouvert")
    aac_closed = await _insert_aac(ufa["id"], AAC_CLOSED_LABEL, 4_500.0, 12_000.0, "ferme")

    # Official DME/UFA (Loi 016/01 art. 124): overrides the provisional default
    # so the admin UI shows an "Arrêté UFA" row and declarations are judged
    # against it. Cascades with the UFA, so re-running stays idempotent.
    for species, dme_cm, source in SEEDED_UFA_DME:
        await db.execute(
            "INSERT INTO ufa_dme"
            " (ufa_id, species_scientific_name, dme_cm, source, decided_by, decided_at)"
            " VALUES ($1, $2, $3, $4, $5, now())",
            ufa["id"],
            species,
            dme_cm,
            source,
            admin_id,
        )

    # Conventions (Loi 016/01): the legal instruments behind the title — the
    # convention provisoire that followed the CPAET, the convention définitive
    # (~15 ans) and the attestation de conformité issued by the Ministry.
    for conv in SEEDED_CONVENTIONS:
        await db.execute(
            "INSERT INTO title_conventions"
            " (title_id, convention_type, reference, signed_at, start_date, end_date,"
            "  surface_ha, status, attestation_ref, attestation_issued_at, decided_by,"
            "  decided_at, created_by)"
            " VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, now(), $10)",
            title_id,
            conv["convention_type"],
            conv["reference"],
            conv["start_date"],
            conv["start_date"],
            conv["end_date"],
            60_000.0,
            conv["attestation_ref"],
            TODAY - timedelta(days=180) if conv["attestation_ref"] else None,
            admin_id,
        )

    for auth_type, ref in (
        ("certificat_assiette", "DEMO-CA-2026-01"),
        ("permis_annuel_operations", "DEMO-PAO-2026-01"),
        ("certificat_vente_coupe", "DEMO-CVC-2026-01"),
    ):
        await db.execute(
            "INSERT INTO aac_authorizations"
            " (aac_id, authorization_type, reference, issued_by, issued_at, valid_from,"
            "  valid_to, startup_notified_at, status)"
            " VALUES ($1, $2, $3, $4, $5, $5, $6, now(), 'delivre')",
            aac_open,
            auth_type,
            ref,
            admin_id,
            TODAY - timedelta(days=30),
            TODAY + timedelta(days=335),
        )

    # --- Documents (company + title), incl. one expired & one expiring ------
    await _insert_doc(
        "company",
        company_org,
        "agrement_exploitation",
        "DEMO-AGR-01",
        TODAY + timedelta(days=400),
        "valide",
        admin_id,
    )
    await _insert_doc(
        "company",
        company_org,
        "quittance_taxe_superficie",
        "DEMO-QTS-2026",
        TODAY + timedelta(days=45),
        "valide",
        admin_id,  # expiring soon
    )
    await _insert_doc(
        "title",
        title_id,
        "plan_amenagement",
        "DEMO-PA-01",
        TODAY - timedelta(days=20),
        "valide",
        admin_id,  # expired -> anomaly
    )
    await _insert_doc(
        "title",
        title_id,
        "cpaet",
        "DEMO-CPAET-01",
        TODAY + timedelta(days=900),
        "valide",
        admin_id,
    )

    # --- Harvest declarations (drive the hard anomalies) --------------------
    await _insert_declaration(
        company_id,
        title_id,
        aac_open,
        "DEMO-DECL-001",
        [
            ("001", "Aucoumea klaineana", 55.0, ["below_dme"]),
            ("002", "Baillonella toxisperma", 110.0, ["reserved_species"]),
            ("003", "Pterocarpus soyauxii", 90.0, ["outside_aac"]),
            ("004", "Entandrophragma cylindricum", 95.0, ["cites_listed"]),
            ("005", "Aucoumea klaineana", 110.0, []),
        ],
        admin_id,
    )
    await _insert_declaration(
        company_id,
        title_id,
        aac_closed,
        "DEMO-DECL-002",
        [("006", "Terminalia superba", 100.0, [])],
        admin_id,
    )

    # --- Tree registry (dashboard harvest rollup) ---------------------------
    for suffix, species, dbh, status in STEMS:
        await db.execute(
            "INSERT INTO tree_registry"
            " (tree_code, marking_type, species_scientific_name, measured_dbh_cm, company_id,"
            "  status, permit_number, aac_label, title_id, aac_id, hammer_mark, felled_at,"
            "  df10_entry_no)"
            " VALUES ($1, 'qr', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
            _code(suffix),
            species,
            dbh,
            company_id,
            status,
            TITLE_REF,
            AAC_OPEN_LABEL if suffix != "006" else AAC_CLOSED_LABEL,
            title_id,
            aac_closed if suffix == "006" else aac_open,
            f"HM-{suffix}",
            datetime.now(UTC) - timedelta(days=10),
            f"DF10-2026-{suffix}",
        )

    # --- Custody ledger (incl. one felling without any declaration) ---------
    for suffix in ("001", "002", "003", "004", "005", "006", "099"):
        await db.execute(
            "INSERT INTO custody_events (tree_code, event, actor_id, note, created_at)"
            " VALUES ($1, 'abattu', $2, 'Carnet de chantier', $3)",
            _code(suffix),
            company_id,
            datetime.now(UTC) - timedelta(days=9),
        )
    for suffix, event in (
        ("009", "transporte"),
        ("010", "receptionne"),
        ("007", "transforme"),
        ("008", "transforme"),
    ):
        await db.execute(
            "INSERT INTO custody_events (tree_code, event, actor_id, created_at)"
            " VALUES ($1, $2, $3, $4)",
            _code(suffix),
            event,
            company_id,
            datetime.now(UTC) - timedelta(days=5),
        )

    # --- Transport (covers exactly one stem) --------------------------------
    await db.execute(
        "INSERT INTO transport_documents"
        " (org_id, doc_type, reference, from_label, to_label, tree_codes, volume_m3,"
        "  issued_by, issued_at, status)"
        " VALUES ($1, 'bordereau_roulage', 'DEMO-BRD-01', $2, $3, $4::jsonb, $5, $6, now(),"
        " 'receptionne')",
        company_org,
        UFA_LABEL,
        "Port d'Owendo",
        f'["{_code("010")}"]',
        merchantable_volume_m3(75.0, "Dacryodes glaucescens"),
        company_id,
    )

    # --- Fiscal: one settled due, one overdue (anomaly), one upcoming -------
    receipt = await _one(
        "INSERT INTO tax_receipts"
        " (org_id, title_id, tax_type, period_year, amount_fcfa, receipt_ref, paid_at, status)"
        " VALUES ($1, $2, 'superficie', $3, $4, 'DEMO-QUIT-01', $5, 'paye') RETURNING id",
        company_org,
        title_id,
        TODAY.year,
        12_000_000.0,
        TODAY - timedelta(days=60),
    )
    await db.execute(
        "INSERT INTO tax_dues"
        " (org_id, title_id, tax_type, period_year, amount_fcfa, due_at, notes, receipt_id,"
        "  created_by)"
        " VALUES ($1, $2, 'superficie', $3, $4, $5, 'Réglée', $6, $7)",
        company_org,
        title_id,
        TODAY.year,
        12_000_000.0,
        TODAY - timedelta(days=60),
        receipt["id"],
        admin_id,
    )
    await db.execute(
        "INSERT INTO tax_dues"
        " (org_id, title_id, tax_type, period_year, amount_fcfa, due_at, notes, created_by)"
        " VALUES ($1, $2, 'abattage', $3, $4, $5, 'En retard', $6)",
        company_org,
        title_id,
        TODAY.year,
        3_500_000.0,
        TODAY - timedelta(days=15),  # overdue -> anomaly
        admin_id,
    )
    await db.execute(
        "INSERT INTO tax_dues"
        " (org_id, title_id, tax_type, period_year, amount_fcfa, due_at, notes, created_by)"
        " VALUES ($1, $2, 'surveillance', $3, $4, $5, 'À venir', $6)",
        company_org,
        title_id,
        TODAY.year,
        800_000.0,
        TODAY + timedelta(days=90),
        admin_id,
    )

    # --- Community development (CCC / FDL) ----------------------------------
    await db.execute(
        "INSERT INTO community_agreements"
        " (title_id, community_org_id, ccc_ref, ccc_signed_at, fdl_rate_fcfa_m3,"
        "  annual_volume_m3, contribution_fcfa, status)"
        " VALUES ($1, $2, 'DEMO-CCC-01', $3, 800, 5_000, 4_000_000, 'actif')",
        title_id,
        community_org,
        TODAY - timedelta(days=180),
    )
    await db.execute(
        "INSERT INTO community_agreements"
        " (title_id, community_org_id, ccc_ref, ccc_signed_at, fdl_rate_fcfa_m3,"
        "  annual_volume_m3, contribution_fcfa, status)"
        " VALUES ($1, $2, 'DEMO-CCC-02', $3, 750, 2_000, 1_500_000, 'suspendu')",
        fc_id,
        community_org,
        TODAY - timedelta(days=120),
    )

    # --- Certification ------------------------------------------------------
    await db.execute(
        "INSERT INTO certifications"
        " (org_id, title_id, scheme, cert_type, certificate_ref, surface_ha, valid_from,"
        "  valid_to, status)"
        " VALUES ($1, $2, 'FSC', 'gestion_durable', 'DEMO-FSC-C001234', 60_000, $3, $4,"
        " 'actif')",
        company_org,
        title_id,
        TODAY - timedelta(days=100),
        TODAY + timedelta(days=1000),
    )

    # --- A couple of review decisions so the register tells a story ---------
    await db.execute(
        "INSERT INTO anomaly_reviews"
        " (anomaly_type, subject_key, title_id, aac_id, org_id, status, decision_motif,"
        "  reviewed_by, reviewed_at)"
        " VALUES ('felled_without_authorization', $1, $2, NULL, $3, 'traitee', $4, $5, now())",
        _code("099"),
        title_id,
        company_org,
        "Mise en demeure notifiée",
        admin_id,
    )
    await db.execute(
        "INSERT INTO anomaly_reviews"
        " (anomaly_type, subject_key, title_id, aac_id, org_id, status, decision_motif,"
        "  reviewed_by, reviewed_at)"
        " VALUES ('transport_sans_bordereau', $1, $2, $3, $4, 'ecartee', $5, $6, now())",
        _code("007"),
        title_id,
        aac_open,
        company_org,
        "Bordereau en cours de saisie (pièce fournie par l'entreprise)",
        admin_id,
    )

    print("Demo dataset seeded.")
    print(f"  company login : {COMPANY_EMAIL} / {COMPANY_PASSWORD}")
    print(f"  title/UFA/AAC : {TITLE_REF} -> {UFA_LABEL} -> {AAC_OPEN_LABEL}, {AAC_CLOSED_LABEL}")
    print(f"  community FC  : {FC_REF} (CCC DEMO-CCC-01)")
    print(f"  stems         : {len(STEMS)} registered, all 9 anomaly families covered")


async def run() -> None:
    try:
        await seed()
    finally:
        await db.close_pool()


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    asyncio.run(run())


if __name__ == "__main__":
    main()
