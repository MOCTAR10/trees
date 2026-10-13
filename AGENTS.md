# AGENTS.md

Guidance for automated agents working in this repository. Read it before
touching code — it tells you **what the project is**, **where it stands**, and
**how to continue it**.

- `README.md` — human-facing overview (quickstart, users, commands).
- `docs/GABON_WORKFLOW_ANALYSIS.md` — **the authoritative roadmap**. Its §5 is
  the gap analysis (legal domain → support → gap), §6 the domain model actually
  implemented, §7 the target Ministère/Entreprise workflow, §9 the slice plan,
  §10 the frozen decisions and open points. When in doubt, that document wins.
- This file — the map: architecture, current position, delivery workflow,
  conventions, gotchas, golden rules.

## 1. What this project is

**Foresterie Numérique** — a digital forestry and circular-economy valorization
engine for the Congo Basin (Gabon), aligned with **Loi 016/01 (code forestier)**
and **EUDR**. It covers measure → traceability → titles/authorizations → taxes →
certifications → anomalies/dashboard → environmental studies → EUDR diligence.

```
Expo app (React Native + TS)
        │  multipart images + GPS/depth, JSON APIs
        ▼
Node gateway (Express, :3000)      auth (bearer), API key, rate limit, proxy
        │
        ▼
FastAPI core (Python 3.13, :8000)  vision, allometrics, RAG, Geo, PDF
        │
        ▼
PostgreSQL 16 + PostGIS + pgvector (:5433)
```

| Service | Path | Stack |
| --- | --- | --- |
| Mobile app | `mobile/` | Expo SDK 57, React Native, TypeScript |
| API gateway | `backend-node/` | Node 22, Express, http-proxy-middleware |
| Scientific core | `backend-python/` | FastAPI, OpenCV, SAM 2.1 + Depth Anything V2 (transformers, Apache-2.0), RAG, Groq, Google Earth Engine |
| Database | `db/` | PostgreSQL 16, PostGIS, pgvector |

Four roles: `operator`, `company`, `cooperative`, `admin`. The UI is **French**
only (`mobile/src/i18n/fr.ts`). There is **no navigation library**: `App.tsx`
routes with a `phase` state machine plus role checks; screens are mounted from
per-role containers (`CompanyScreen`, `AdminScreen`, …) that expose tabs.

## 2. Where we are (as of Slice 18)

The product is built as **vertical slices**: each slice ships a DB migration, the
backend, optionally an operational CLI under `tools/`, the mobile UI, and the
doc update — as separate logical commits. The full history lives in
`docs/GABON_WORKFLOW_ANALYSIS.md` **§9**.

**Slices 1–17 are DONE, committed on `main`, and pushed (CI green). Slice 18 is implemented and verified locally.** GFW is live (key in `.env`, valid 1 year; Gabon layers imported into `gfw_features`).

| # | Domaine | Migration | Backend | Mobile | Docs §9 |
| --- | --- | --- | --- | --- | --- |
| 1 | Données gouvernance (organizations, profils, document_types, titres, UFA, AAC, autorisations, taxes, CCC, transport, certifications) | `009_gouvernance.sql` | — | — | pt 1 |
| 2 | API gouvernance + porte de conformité 2 niveaux | — | `/api/organizations`, `/documents`, `/titles`, `/taxes`, `/compliance` | — | pt 2 |
| 3 | Mobile Entreprise/Ministère (documents, titres, taxes) | — | — | `OrgDocuments`, `CompanyTitles`, `OrgTaxes`, `AdminDocuments`, `AdminTitles` | pt 3 |
| 4 | Traçabilité (DF10, transport) | `010_traceability.sql` | `/api/traceability`, `/api/transport` | `CompanyTraceability`, `AdminTraceability` | pt 4 |
| 5 | Fiscalité, social (CCC/FDL), EUDR parcelle | `011_slice5.sql` | `/api/taxes`, `/api/community`, `/api/eudr` | `CompanyFiscal`, `AdminFiscal` | pt 5 |
| 6 | Autorisation d'exploiter (art. 14) | `012_slice6.sql` | `/api/titles/.../authorizations` | `AacAuthorizations` | pt 6 |
| 7 | Certifications tierces (FSC/PAFC…) | `013_slice7.sql` | `/api/certifications` | `Company/AdminCertifications` | pt 7 |
| 8 | Anomalies (9 familles) + dashboard Ministère | `014_slice8.sql` | `/api/anomalies`, `/api/dashboard` | `AdminAnomalies`, `AdminDashboard` | pt 8 |
| 9 | DME/UFA (art. 124) | `015_slice9.sql` | `/api/titles/units/{id}/dme` | `UfaDme` | pt 9 |
| 10 | Conventions provisoire/définitive + attestation | `016_slice10.sql` | `/api/titles/{id}/conventions` | `TitleConventions` | pt 10 |
| 11 | Études environnementales PPF/EIE + certificat | `017_slice11.sql` | `/api/titles/{id}/studies` | `TitleStudies` | pt 11 |
| 12 | EUDR — géolocalisation exacte par grume | `018_slice12.sql` | `/api/eudr/diligence/{id}/stems` | `EudrStems` | pt 12 |
| 13 | Entité légale : rattachement des comptes legacy | `019_slice13.sql` | `/api/organizations/orphans`, `/backfill` | `OrgBackfill` | pt 13 |
| 14 | Mesure de l'arbre : DBH fiabilisé (ruban/compas + photo), hauteur mesurée, carbone | `020_slice14.sql` | `/api/v1/process-scan` (champs mesure) | `CaptureScreen` (étape DBH, ruban/compas, hauteur), `ReportScreen` | pt 14 |
| 15 | Scanner IA (SAM 2.1, distance IA), grume liée par QR, clinomètre/niveau, carbone par AAC | `021_slice15.sql` | `/api/v1/capabilities`, `/api/dashboard` (carbone), `tools.export_trunk_dataset` | `Clinometer`, `CaptureScreen` (QR, niveau, auto), `AdminDashboard` | pt 15 |
| 16 | Espèce (flore régionale + re-classement Gabon), plaque QR « règle », contrôles GFW, Carte 2.0 | `022_slice16.sql` | `/api/map/*`, `tools.gfw_api_key`, `tools.import_gfw_layers`, `tools.import_gabon_context`, `tools.print_qr_plates` | `MapScreen`, `ForestChecksCard`, `ReportScreen` | pt 16 |
| 17 | Carte fluide (emprise + zoom, recherche, fiches), contrôles parc/concession à la déclaration, plaques par déclaration, capteur LiDAR/ARCore natif | — | `/api/map/layers?zoom&bbox`, `/api/map/search`, `/api/map/feature`, `/api/felling/declarations/{id}/plates.pdf` | `MapScreen`, `CompanyScreen`, `CaptureScreen`, `modules/depth-sensor` | pt 17 |
| 18 | DBH par bords confirmés par l'opérateur, calcul hors-ligne sur le téléphone ; IA lourde désactivée par défaut | `023_slice18.sql` | `/api/v1/process-scan` (`edge_left`, `edge_right`) | `EdgeAdjuster`, `utils/dbh.ts`, `CaptureScreen` | pt 18 |

Latest verified suite counts (Slice 18): **`pytest` 436 passed** ·
**`jest` 146 passed / 41 suites** · `ruff` and `tsc` clean.

### What is left (next candidates)

These are the §5 gap-table rows still **not** fully covered, plus the
"à brancher" integrations. Pick the next one **with the user**; do not start a
slice unprompted.

- **Multi-autorités** (§5 row 221, §7.3, §10 pt 3) — `admin` is still a single
  monolithic Ministère role. Target: distinguish **DGF / DGFAP / DGE / ANPN /
  DGICBVPF / Douanes** as roles or scoped attributes (provincial/central).
  **Frozen decision so far: keep `admin` monolithic for now** and split later.
- **Matérialisation des limites (forêt communautaire)** (row 216): the CAE
  authorization cycle is complete, but the FC boundary-materialization documents
  (`legal_documents`) are not wired.
- **“À brancher” items** (rows 208–212): QR code per log, DF10 administration
  visa, DGI electronic tax filing, automatic DGF statement transmission, CCC
  revenue split along the agreement.
- **Native depth (LiDAR / ARCore)** — deferred, Expo Go kept. Plan in
  `docs/GABON_WORKFLOW_ANALYSIS.md` §10 open point 13 (Expo Dev Build + a local
  `DepthProvider` module feeding the existing `opencv_depth` path).
- **Gabon trunk model** — export the tape-verified photos with
  `python -m tools.export_trunk_dataset` and train on an Apache/MIT stack
  (never re-add Ultralytics: AGPL-3.0).
- **Domain values to confirm with the métier** (§10 open points): `ASC`/`ACBSL`
  scope, authority model, offline signature/QR authenticity, APV/FLEGT,
  convention durations (3 y / 15 y), PPF/EIE validity, EUDR out-of-parcel
  tolerance. Where a duration/meaning is not enforced, the code **stores dates
  without imposing them** and the doc says **“à valider par le métier”** — keep
  that pattern.

### Live environment state

- Stack runs in Docker: `forestry_postgres`, `forestry_fastapi`, `forestry_gateway`.
  The API source is bind-mounted with `--reload`, so new endpoints are live once
  saved; the DB is at host port **5433**.
- Demo data: `docker exec forestry_fastapi python -m tools.seed_demo` (idempotent;
  company login `company.demo@forestry.local` / `Demo12345`; admin from `.env`,
  `admin@forestry.local` / `Admin12345`).
- Slice 13 was applied live: the two legacy accounts (`company@forestry.local`,
  `coop@forestry.local`) are now linked to organizations 12 (`entreprise`,
  `exploitant_forestier`) and 13 (`cooperative`, no profile). Re-running the
  backfill is idempotent (`0/0`).

## 3. Definition of done for a slice

Follow the vertical order so history stays bisectable; one commit per layer:

1. **DB** — `db/migrations/0NN_sliceNN.sql` (additive, `IF NOT EXISTS`), plus the
   mount in `docker-compose.yml`:
   `./db/migrations/0NN_sliceNN.sql:/docker-entrypoint-initdb.d/NN_slicename.sql:ro`.
2. **Backend** — `app/api/*.py` + `app/services/*.py` + `tests/test_*.py`.
3. **Tools** (if the slice needs an operator action) — `tools/*.py` CLI.
4. **Mobile** — types + helpers in `mobile/src/api/client.ts`, a component in
   `mobile/src/components/`, mount it in the owning screen, i18n keys in
   `mobile/src/i18n/fr.ts`, tests in `mobile/__tests__/*.test.tsx`.
5. **Docs** — update `docs/GABON_WORKFLOW_ANALYSIS.md`: the §5 row, §6 (new
   table/columns), §7.2, a §9 item with the real suite counts, and §10 if a
   decision/open point changes.

Then, before committing:

- Apply the migration to the **live** DB (init scripts only run on a fresh
  volume) and mount it in compose.
- Run the operational path against **real Postgres** (a smoke test): the fake-DB
  unit tests do not exercise SQL/PostGIS.
- Run the full gates: `ruff check` + `ruff format --check` + `pytest` (backend),
  `tsc --noEmit` + `jest` (mobile).
- After push, confirm the commit landed (`git ls-remote origin main`) and that CI
  is green (see §6). Do not push over an in-progress run.

## 4. Commands

Backend (`backend-python/`) — either inside the container or with the local venv
(`backend-python/.venv`):

```powershell
docker exec forestry_fastapi ruff check .
docker exec forestry_fastapi ruff format --check .
docker exec forestry_fastapi pytest tests -q
# or locally:  .\.venv\Scripts\python.exe -m pytest -q
```

Gateway (`backend-node/`):

```
npm test
node --check src/index.js
```

Mobile (`mobile/`):

```
npx tsc --noEmit
npx jest --ci
```

Full-stack smoke (stack must be up):

```
python backend-python/scripts/smoke_stack.py
```

Apply a migration to a running DB:

```powershell
Get-Content db/migrations/0NN_sliceNN.sql | docker exec -i forestry_postgres psql -U forestry -d forestry
```

## 5. Conventions

- **Python**: type hints, `async` handlers, `ruff` (version `0.16.10` in CI). No
  new runtime dependency without a strong reason; JWT/auth uses the stdlib.
- **DB access** goes through `app/services/db.py` (`fetch_one`, `fetch_all`,
  `execute`); close the pool in CLI tools (`finally: await db.close_pool()`).
  Tests monkeypatch these functions in-memory (see `tests/test_rbac.py`).
- **Slices are additive and idempotent** — never rewrite an existing migration;
  add the next number. `docker-compose.yml` mounts them in order.
- **Derived status at read time** is a recurring pattern (e.g. `du|en_retard|paye`,
  `expire`); prefer computing from dates/links over storing mutable state.
- **PDF** rendering lives in `services/pdf_report.py` (`render_*_pdf` + label
  maps); every Ministère-facing record has a PDF.
- **Gateway** is a proxy only; it does not implement user auth. Sessions are
  JWTs signed by FastAPI and validated by `app/core/deps.py`.
- **Mobile** has no navigation library; French strings live in `src/i18n/fr.ts`.
  Components are shared with a `mode="company"|"admin"` prop where the same
  record is viewed by both sides.

## 6. CI, push, verification

`.github/workflows/ci.yml` runs four jobs — **backend**, **gateway**, **mobile**,
**stack smoke** — and gates on `CI · success`. `concurrency.cancel-in-progress`
cancels superseded runs, so **wait for the previous run to finish before
pushing**.

Verify a push landed (PowerShell: `git push` prints a red error line even on
success — trust `ls-remote`, not the exit code):

```powershell
git ls-remote origin main
git rev-parse HEAD
```

Check CI for a commit via the public API:

```
https://api.github.com/repos/MOCTAR10/trees/actions/runs?head_sha=<full-sha>
```

## 7. Gotchas

- `db/` migrations are Docker init scripts and **only apply to a fresh volume**.
  Apply to a live DB manually (see §4).
- The `.env` is at the repo root; `DATABASE_URL` uses host port **5433**. Changing
  `.env` requires recreating the container (`docker compose up -d api`); a plain
  restart does not reload `env_file`.
- `ruff` is installed by CI, not in `requirements.txt`. In a running container
  install it ad hoc with `docker exec forestry_fastapi pip install -q "ruff==0.16.10"`
  (lost on container recreation).
- PostGIS/SQL is **not** covered by the fake-DB unit tests — always smoke the new
  queries on real Postgres.
- `mobile/__tests__/CaptureScreen.test.tsx` and `OrgDocuments.test.tsx` can
  time out under full parallel `jest` on a loaded machine; they pass on re-run
  / in isolation. Unrelated to feature work.
- Map layers must stay viewport + zoom bounded (`/api/map/layers?zoom&bbox`):
  the full Gabon GFW layers are ~65 000 vertices (7.5 MB) unsimplified.
- `mobile/modules/depth-sensor` is native (Swift/Kotlin) and only compiles in
  an Expo **Development Build** (`npx expo install expo-dev-client`,
  `npx expo run:android` / `eas build --profile development`); Expo Go simply
  reports it unavailable. Do not add `expo-dev-client` casually: it changes
  `expo start` for everyone (use `--go` to keep Expo Go).
- On Windows/Docker Desktop the API's `--reload` can lag or miss a save on the
  bind mount. If a live check still shows old behaviour, run
  `docker restart forestry_fastapi` before concluding the fix failed.
- `tree_scans.dbh_method` has a CHECK constraint: a new DBH method value must be
  added there (migration) or the scan insert fails — and v1 only **logs** that
  failure (the report is still returned), so watch the API logs.
- DBH design choice: the operator confirms the trunk edges and the phone computes
  DBH offline (`mobile/src/utils/dbh.ts` mirrors `core/geometry.diameter_from_edges_cm`;
  keep the two in sync). Heavy AI stays **off by default**.
- Scanner AI (`AI_MODELS_ENABLED=true`, optional) needs **≥ 3 GB** for the API container
  (`AI_MIN_MEMORY_MB`); below that it disables itself and logs why. Docker
  Desktop defaults can be lower (1.8 GB here): raise it in Docker Desktop →
  Settings → Resources. First load downloads ~250 MB into `forestry_hf_cache`
  and warms up in the background (~2–3 min on CPU).
- Tests force `AI_MODELS_ENABLED=false`, empty `GFW_API_KEY`, and reset the soil/GEE/GFW caches
  (`tests/conftest.py`); never let a test load real models.
- GFW: create the key with `python -m tools.gfw_api_key` in **your own
  terminal** (masked password; it writes `.env`), never through a chat.
  Public GFW raster tiles need no key; queries and vector downloads do.
- QR plates complement — never replace — the legal marking (hammer, paint,
  DF10 number). The printed QR square must match `QR_TAG_SIZE_CM` (8 cm).
- Never let an upstream error message reach the logs verbatim when the request
  URL carries a key (Pl@ntNet passes `api-key` as a query parameter).
- IUCN enrichment is blocked until `IUCN_API_TOKEN` is provided.

## 8. Golden rules

- Keep CI green on every push. CI is the gate; do not push while a run is in
  progress. The required status check is `CI · success`.
- Do not add code comments unless explicitly asked.
- Never commit `.env` or any secret / service-account JSON (`.env` and
  `mobile/.env` are git-ignored).
- Do not commit unless explicitly asked. Never force-push.
