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

## 2. Where we are (as of Slice 26)

The product is built as **vertical slices**: each slice ships a DB migration, the
backend, optionally an operational CLI under `tools/`, the mobile UI, and the
doc update — as separate logical commits. The full history lives in
`docs/GABON_WORKFLOW_ANALYSIS.md` **§9**.

**Slices 1–25 are DONE, committed on `main`, and pushed (CI green, including the workflow job). Slice 26 is implemented and verified locally.** GFW is live (key in `.env`, valid 1 year; Gabon layers imported into `gfw_features`).

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
| 19 | Accueil agent (prénom, activité, groupe), chantiers d'AAC et projets participatifs, scan libre ou pour un projet | `024_slice19.sql` | `/api/home/summary`, `/api/home/me`, `/api/projects` (join/accept/decline/invite/aac-options, `/{id}/chantier`), `/api/v1/process-scan` (`project_id`) | `HomeScreen`, `ChantierScreen`, `ProfileScreen`, `CaptureScreen`, `CreateProjectScreen`, `ProjectDetailScreen`, `AdminUsers`, `RoleHeader` (badge en ligne) | pt 19 |
| 20 | Espace Ministère (Tableau de bord, À traiter, Organisations, Menu), provinces, titre enregistré par le Ministère ; art. 14 bloquant à la déclaration | `025_slice20.sql` | `/api/admin/inbox(/items)`, `/api/admin/provinces`, `/api/organizations/directory`, `/{id}/sheet`, `/{id}/accounts`, `/api/titles/register`, `/api/titles/{id}/province`, `/api/felling/aac-options`, `tools.import_provinces` | `ministry/*` (MinistryHome, Inbox, Organisations, Organisation, Menu, Domain), `AdminDeclarations`, `DeclareScreen` (AAC), admin components restylés | pt 20 |
| 21 | Espace Ministère (étape B) : page de décision unique par dossier, contrôles terrain (marquage, visa DF10, route + PV, transformation), avertissements carnet non tenu / CITES sans permis | `026_slice21.sql` | `/api/admin/inbox/{type}/{id}` (+ `/decision`), `/api/controls` (`lookup`, création, liste), anomalie `controle_non_conforme` | `ministry/DecisionScreen`, `ministry/ControlsScreen` | pt 21 |
| 22 | Cycle de vie de la grume : AAC + détenteur à la déclaration, abattage / transformation par le détenteur, bordereau ⇒ transport, réception par le destinataire, écran Suivi des grumes | `027_slice22.sql` | `services/custody.py`, `GET /api/felling/trees/{code}`, `POST /api/felling/events`, `/api/transport/destinations`, `/api/transport/documents` (destinataire, réception) | `CustodyScreen`, `QrScanner`, `CompanyTraceability`, `HomeScreen` | pt 22 |
| 23 | Espace entreprise (À faire, décisions reçues, anomalies, PV), boussole des autorités (Ministère agissant, autorité compétente affichée), jeu pilote par l'API, suite de bout en bout | — | `/api/company/space`, `/api/admin/authorities`, `services/authorities.py`, `services/company_space.py`, `tools.seed_pilot`, `tools.pilot_client`, `tests_e2e/` | `CompanyHomeScreen`, `CompanyNav`, `ministry/AuthoritiesScreen`, `DecisionScreen` (bandeau) | pt 23 |
| 24 | Échéances légales (AAC 3 ans, état annuel 31 mars, autorisations, pièces), transmission de l'état annuel, PV de contrôle PDF | `028_slice24.sql` | `services/deadlines.py`, `/api/traceability/statements/file`, `/api/traceability/filings`, `/api/controls/{id}/pdf`, anomalies `aac_ouverture_depassee` / `etat_annuel_non_transmis` | `CompanyHomeScreen` (transmettre, PV), `ControlsScreen` (PV), `MinistryHomeScreen` (alertes) | pt 24 |
| 25 | Régression par rôle (100 % des points d'accès de chaque rôle), comptes créés par le Ministère rattachés (coopérative, employeur) | `029_slice25.sql` | `scripts/role_coverage.py`, `POST /api/organizations/{id}/accounts` | en-tête entreprise | pt 25 |
| 26 | Inventaire par scan, équipe gérée par l'entreprise, registre de transformation, suites des contrôles, limite de débit par session, affichage français | `030_slice26.sql` | `services/mill.py`, `/api/mill/*`, `/api/organizations/me/agents`, `/api/controls/{id}/followups`, `/api/controls/followups` (`/status`, `/contest`), file `followups`, `core/fr_format.py`, passerelle | `CompanyAgents`, `MillRegister`, `ministry/ControlFollowups`, `CompanyHomeScreen` (contester), `DeclareScreen` (inventaire), `ScreenAudit` | pt 26 |
| 27 | Application web du Ministère (même code, `react-native-web`), menu latéral bureau, carte Leaflet, PDF navigateur, hébergement `foresterie-app.greenleaves.ga` | — | — | `src/web/` (DesktopFrame, LeafletMaps, WebFieldNotice), `metro.config.js`, `pdf.ts` | pt 27 |
| 28 | Espace entreprise sur le système de design (plus de thème sombre imposé), menu latéral « Mon entreprise » sur le web bureau, connexion sans défilement, organisation affichée à la connexion | — | `/api/auth/check-email` (organisation) | `CompanyNav` (`hideGroups`), `CompanyScreen` (onglet piloté), `DesktopFrame` (`sections`), `LoginScreen` | pt 28 |

Latest verified suite counts (Slice 26): **`pytest` 718 passed** · **`tests_e2e` 196 passed**
(real Postgres) · role coverage **100 %** (admin 98, company 102, operator 37, cooperative 30) ·
**`jest` 200 passed / 53 suites** · gateway **8** · `ruff` and `tsc` clean.

### What is left (next candidates)

These are the §5 gap-table rows still **not** fully covered, plus the
"à brancher" integrations. Pick the next one **with the user**; do not start a
slice unprompted.

- **Multi-autorités** (§5 row 221, §7.3, §10 pt 3) — `admin` is still a single
  monolithic Ministère role. Target: distinguish **DGF / DGFAP / DGE / ANPN /
  DGICBVPF / Douanes** as roles or scoped attributes (provincial/central).
  **Frozen decision so far: keep `admin` monolithic for now** and split later.
- **Done in Slice 26** (from the 15 Oct 2026 audit): inventory by scan, company-managed agent
  accounts, transformation register, control follow-ups, per-session rate limit.
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
  company login `company.demo@forestry.local` / `Demo12345`; field agent
  `agent.demo@forestry.local` / `Demo12345` (Nzé Obiang, invited to the demo chantier); admin from `.env`,
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

Pilot dataset and end-to-end suite (real Postgres, stack up):

```powershell
docker exec -w /app forestry_fastapi python -m tools.seed_pilot            # build "PILOTE" (skipped if present)
docker exec -w /app forestry_fastapi python -m tools.seed_pilot --reset    # rebuild
docker exec -w /app forestry_fastapi python -m pytest tests_e2e -q         # throw-away namespace, cleaned up
```

Pilot logins: `<alias>@pilote.ga` / `Pilote2026!` (e.g. `hob.dg`, `hob.agent1`, `sdl.dg`,
`cfn.dg`, `mas.chef`, `can.pres`, inspectors `mef.dp2`, `mef.brigade`).

Full-stack smoke (stack must be up):

```
python backend-python/scripts/smoke_stack.py
```

Apply a migration to a running DB:

```powershell
Get-Content db/migrations/0NN_sliceNN.sql | docker exec -i forestry_postgres psql -U forestry -d forestry
```

Production (`https://greenleaves.ga`, server `79.143.177.127`, app in `/var/www/trees`):

```bash
ssh greenleaves /var/www/trees/deploy/deploy.sh   # pull main, rebuild, new migrations, restart
```

`deploy/server_setup.sh` (once, as root) installs Docker/nginx/certbot/ufw, clones the repo, generates the
production `.env` **on the server only** (secrets never committed nor pasted in a chat), sets up TLS and runs
`deploy.sh`. `docker-compose.prod.yml` keeps Postgres off the host ports and binds the API and the gateway to
127.0.0.1 (nginx is the only public entry, gateway with `REQUIRE_API_KEY=true`). Applied migrations are tracked
in `schema_migrations`; a new `0NN_*.sql` is applied by the next `deploy.sh`.
**Web app (Slice 27)**: `https://foresterie-app.greenleaves.ga` — the mobile code exported for the browser
(`npx expo export --platform web`). Web-only pieces live in `mobile/src/web/`: `DesktopFrame` (side menu at
≥ 1024 px, kept on decision/domain/organisation pages), `LeafletMaps` (`react-native-maps` is resolved to it for
the web by `metro.config.js` — keep its API in step when a screen uses a new map prop), `WebFieldNotice`
(agents and cooperatives are sent to the Android app). `deploy.sh` → `deploy/web/build.sh` rebuilds the site when
`mobile/` changed; nginx (`deploy/web/nginx-web.conf`) relays `/api` **adding the gateway key**, so the bundle is
built with `EXPO_PUBLIC_API_URL=` (relative) and no key. One-time host setup: `WEB_HOST=foresterie-app.greenleaves.ga
bash deploy/web/setup.sh`. Check it in a real browser (screens, map, a PDF), not only with jest.
**API documentation**: Swagger at `https://greenleaves.ga/api/docs` (ReDoc `/api/redoc`, schema
`/api/openapi.json`) — readable without the key; « Authorize » takes the gateway key (`ApiKey`) and the
token from `POST /api/auth/login` (`Bearer`).
**Android builds (Jenkins)**: `https://jenkins.greenleaves.ga` (job `foresterie-android`, `mobile/Jenkinsfile`):
`npm ci` → `tsc` → `expo prebuild` → `gradlew assembleRelease` (arm64/armv7) → signed with
`/etc/trees/android/release.keystore` → `https://greenleaves.ga/app/foresterie.apk`. No EAS queue. Runs only when
`mobile/` changed (or by hand). Jenkins has `cpu_shares: 128` (the app 1024) and hard caps (4 CPUs, 7 GB + 3 GB swap; arm64-only, 2 Gradle workers): a build
never slows the users' app. Setup once: `JENKINS_HOST=jenkins.greenleaves.ga bash deploy/jenkins/setup.sh`.
**Back up the signing keystore and its password** (`/etc/trees/`): losing them means phones cannot update the app.
**Continuous deployment**: the `trees-autodeploy.timer` (systemd, every 5 min) runs `deploy/autodeploy.sh`, which
deploys the newest commit of `main` **only once its « CI » workflow is green** (log `/var/log/trees-deploy.log`).
So a push to `main` reaches production about 5 minutes after CI passes — keep CI green.

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
- **Design system** (`mobile/src/design/`): identity of the Ministère des Eaux
  et Forêts, taken from the uniform — olive (dominant, actions), forest green
  (header bands), gold (seal, insignia, active marks; never large areas), white.
  `tokens.ts` (light/dark palettes, all pairs WCAG AA), `ThemeProvider.tsx`
  (`useTheme`, `makeStyles`), `ui.tsx` (Txt, Button, Card, Pill, Stat, KeyValue,
  ScreenHeader, Segmented, EmptyState, RankStripes), `format.ts` (French decimal
  comma). Fonts: Barlow Semi Condensed (titles, figures) + Atkinson Hyperlegible
  (body), loaded by `fonts.ts`. The operator space follows the phone's
  light/dark setting; the camera screen is always dark. The Ministry and company
  spaces follow the device theme (Slice 28); only the **cooperative** space is still
  forced dark on the legacy `src/theme.ts` (and a few operator screens use it). Header rank stripes: Ministry 2, company/cooperative 1,
  field agent 0. Reference mockups: `docs/design/maquette_design_v1.html`
  (operator) and `docs/design/maquette_admin_v2.html` (Ministry). 
- **Ministry space** (`mobile/src/screens/ministry/`): bottom bar Tableau de bord ·
  À traiter · Carte · Organisations · Menu (`ADMIN_TABS`). Every pending file shows
  its competent authority and province (display only — a single `admin` role still
  decides). Provinces: `admin_areas` from `tools.import_provinces` (run it once on
  a fresh volume; it reads the bundled `data/gabon_adm1_geoboundaries.geojson`,
  CC BY-SA 3.0 — `--download` refreshes from geoBoundaries); title province = `v_title_province` (manual, else geometry).
  Workflow coverage vs the Ministry guide: `docs/AUDIT_WORKFLOW_MINISTERE.md`.
  End-to-end audit by role and log lifecycle (open defects, priorities): `docs/AUDIT_PARCOURS_COMPLET.md`.
  Tapping a pending file opens `DecisionScreen` (one page for every queue, served by
  `services/decisions.py`); decisions **delegate** to each domain's existing endpoint —
  add new rules there, never in `decisions.py`. Field controls live in `field_controls`
  (`/api/controls`); a `non_conforme` control raises the HARD anomaly `controle_non_conforme`.
- **Scanner** (`CaptureScreen` + `utils/scanFlow.ts`): one guided flow, no
  full/quick modes — Arbre → Écorce → Feuilles → Diamètre → Vérifier, auto-advance
  after each photo, optional extra views (flower, fruit…) from the review. The QR
  scanner is always on: a plate links the tree, and a plate seen at the DBH shot
  lets the **server** measure the distance (the phone's preview estimate is a
  guide only and is never sent). Distance otherwise comes from the depth sensor
  (auto at the DBH shot) or a one-tap preset; tape/caliper is a secondary option.
  Edges are sent only after the operator taps « Valider le diamètre ».
  The DBH step explains 1,30 m (« Pourquoi 1,30 m ? »); zoom only on leaf /
  flower / fruit (DBH views keep their geometry); Android back is handled.
  **Live capture only**: gallery import was removed on purpose (EUDR /
  Ministry record — photo, GPS and time from the same moment at the tree;
  roadmap §10 decision 16). Do not re-add an import path to the official scan.
  The Groq narrative is labelled as AI-written and indicative in the report.

## 6. CI, push, verification

`.github/workflows/ci.yml` runs five jobs — **backend**, **gateway**, **mobile**,
**stack smoke** and **workflow** — and gates on `CI · success`. The **workflow** job
is the whole-workflow regression on a fresh PostgreSQL/PostGIS volume: every
migration, the bundled provinces, `tools.seed_demo` twice (idempotency),
`tools.seed_pilot` built then rebuilt after `--reset` (176 API steps, forbidden steps
must be refused) and `pytest tests_e2e`. A change to a workflow rule must keep the
pilot story and `tests_e2e/` in step, or this job fails.

`.github/workflows/regression.yml` (**Régression**: on push to `main`, nightly at
02:00 UTC, and on demand) boots the **full stack with the gateway and the API key
enforced**, then runs the pilot story and the whole `tests_e2e/` suite **over HTTP
through the gateway**: the end-to-end workflow tests plus the detailed regression suite
`tests_e2e/test_regression_0*.py` — one test per workflow rule, its French docstring
being the rule. It publishes a job summary (rule-by-rule checklist and every expected
refusal) built by `scripts/regression_summary.py`, and uploads JUnit, step logs and
service logs as the `regression-reports` artifact. A new workflow rule = a new
regression test with a one-line French docstring.
**Every role is held to 100 % coverage**: `scripts/role_coverage.py --role
admin|company|operator|cooperative` lists every endpoint open to the role and fails the
Régression job if one is not exercised by an account of that role (pilot aliases:
`admin`/`mef.*`, `*.dg`/`*.chef`, `*.agent*`, `*.pres`); it also maps each screen of the
role to its endpoints. A new endpoint needs a test in `tests_e2e/test_admin_0*.py`,
`test_company_0*.py`, `test_agent_0*.py` or `test_cooperative_0*.py`; keep
`set -o pipefail` in front of any `… | tee` gate (see `docs/AUDIT_REGRESSION_ROLES.md`). `concurrency.cancel-in-progress`
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
- `mobile/__tests__/ScreenAudit.test.tsx` replays recorded pilot responses
  (`__tests__/fixtures/screen-audit.json`). After changing a screen or the pilot story, re-record against the
  live stack (pilot built): `AUDIT_RECORD=1 npx jest __tests__/ScreenAudit.test.tsx`. Never run two jest
  processes at once — they share the transform cache and produce false crashes.
- An unknown plate scanned by a field user **creates** a registry row (`inventorie`); the declaration's
  `duplicate_code` check lets the same company's inventoried stems through. Keep both sides in step.
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
- SAM 2.1's image processor needs **`torchvision`** (pinned next to `torch`, CPU wheels, matching release:
  torch 2.14 ↔ torchvision 0.29). Without it segmentation silently falls back to OpenCV (`dbh_method`
  `opencv_edge_profile`, log « SAM trunk segmentation skipped »). Production runs with `AI_MODELS_ENABLED=true`.
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
- The gateway rate limit counts **per signed-in session** (`RATE_LIMIT_MAX`, default 120/min, keyed by a hash
  of the bearer token), with a cap **per IP** (`RATE_LIMIT_IP_MAX`, 1200/min — an office behind one NAT) and a
  strict limit on **sign-in** (`RATE_LIMIT_AUTH_MAX`, 30/min/IP). Behind a reverse proxy set `TRUST_PROXY` (hop
  count) or every user shares the proxy's IP. The regression workflow raises all three for the pilot story.
- Rehearse `tests_e2e` locally **as CI runs it**: external keys emptied
  (`docker exec -e GFW_API_KEY= -e GROQ_API_KEY= -e PLANTNET_API_KEY= -e AI_MODELS_ENABLED=false …`).
  With the live `.env` keys, external services answer and a test can pass locally yet
  fail on GitHub (e.g. `/api/map/point-check` is 503 without a GFW key — by design).
- Accounts created by the Ministry from an organisation sheet
  (`POST /api/organizations/{id}/accounts`) get the legacy links many screens still use:
  an `operator` gets `company_id` = the organisation's company account (agents created
  first are linked when the manager is created), a `cooperative` gets `cooperative_id` =
  the organisation's community cooperative (created once, `community_cooperatives.organization_id`).
  New code should scope by `organization_id`, not by these legacy links.
- Pilot authority model: the Ministère des Eaux et Forêts (`admin`) performs every
  administrative action; each one carries `acting_authority` + `competent_codes` +
  `competence_note` from `services/authorities.py`. Keep that on any new Ministry action
  (queues, decisions, controls) — the UI shows it as the pilot's compass.
- `tools.seed_pilot` goes through the API and asserts each status: when a workflow rule
  changes, update the pilot story and `tests_e2e/` with it. Raw SQL there is only for
  what the API cannot do (AAC polygons, field scans, reset). Under Git Bash prefix
  `docker exec -w /app …` with `MSYS_NO_PATHCONV=1`.
- Chain of custody: a log moves `autorise → abattu` (event, holder only) →
  `transporte` (only by **issuing** a transport document) → `receptionne` (only by the
  **destination** org receiving it; custody moves to that org) → `transforme` (event,
  holder only). Holder = `tree_registry.custodian_org_id`; field agents act for their
  employer's org (`custody.acting_user`). Never set statuses directly outside the seed.

## 8. Golden rules

- Keep CI green on every push. CI is the gate; do not push while a run is in
  progress. The required status check is `CI · success`.
- Do not add code comments unless explicitly asked.
- Never commit `.env` or any secret / service-account JSON (`.env` and
  `mobile/.env` are git-ignored).
- Do not commit unless explicitly asked. Never force-push.
