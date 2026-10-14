# Foresterie Numérique

Digital forestry and circular-economy valorization engine for the Congo Basin
(e.g. Okoumé, Azobé, Padouk, Ozigo, Moabi). The system identifies tree species,
measures DBH, estimates age, and turns logging residues into an actionable
valorization plan matched to nearby community cooperatives.

## Architecture

```
Expo (React Native + TypeScript)
        │  multipart images + GPS/depth, JSON APIs
        ▼
Node gateway (Express, port 3000)        auth (bearer), API key, rate limit, proxy
        │
        ▼
FastAPI core (Python 3.13, port 8000)    vision, allometrics, RAG, Geo, PDF
        │
        ▼
PostgreSQL + PostGIS + pgvector (port 5433)
```

| Service | Path | Stack |
| --- | --- | --- |
| Mobile app | `mobile/` | Expo SDK 57, React Native, TypeScript |
| API gateway | `backend-node/` | Node 22, Express, http-proxy-middleware |
| Scientific core | `backend-python/` | FastAPI, OpenCV, SAM 2.1 + Depth Anything V2 (open models), LlamaIndex-style RAG, Groq, Google Earth Engine |
| Database | `db/` | PostgreSQL 16, PostGIS, pgvector |

## Prerequisites

- Docker Desktop (Compose v2)
- Node.js 22 (for the mobile app and gateway local dev)
- Python 3.13 (only for running backend checks outside Docker)

## Quickstart

```powershell
Copy-Item .env.example .env
# edit .env: fill PLANTNET_API_KEY and GROQ_API_KEY (others optional)
docker compose up -d --build
```

Service URLs:

- Gateway (used by the mobile app): http://localhost:3000
- FastAPI (direct): http://localhost:8000 — docs at `/docs`
- PostgreSQL: `localhost:5433`

Health checks: `GET http://localhost:3000/health` (gateway + upstream) and
`GET http://localhost:8000/health`.

### Optional services

- Google Earth Engine canopy density: set `GEE_ENABLED=true`, `GEE_PROJECT`,
  and `GEE_SERVICE_ACCOUNT_FILE` (or inline `GEE_SERVICE_ACCOUNT_JSON`).
  With `GEE_ENABLED=false` a mock is used.
- Corpus ingestion (RAG): `docker compose --profile tools run --rm ingest`.
- Scanner AI: set `AI_MODELS_ENABLED=true` to let the server cut the trunk out
  of the DBH photo (SAM 2.1, Apache-2.0) and estimate the bark distance when
  none is typed (Depth Anything V2 metric). Needs **≥ 3 GB** of RAM for the API
  container (raise Docker Desktop → Settings → Resources); ~250 MB of weights
  are downloaded once into the `forestry_hf_cache` volume. Below the memory
  threshold the AI turns itself off and scans use the classical pipeline.
- Global Forest Watch (forest checks at each scan, map layers): create a key
  in your own terminal with
  `cd backend-python; .\.venv\Scripts\python.exe -m tools.gfw_api_key --email <you> --organization MEF --alias trees`
  (masked password, writes `GFW_API_KEY` to `.env`), then `docker compose up -d api`
  and import the Gabon layers: `docker exec forestry_fastapi python -m tools.import_gfw_layers`.
- Import the 9 provinces (geoBoundaries ADM1, CC BY-SA 3.0) once:
  `docker exec forestry_fastapi python -m tools.import_provinces`.
- QR plates (traceability + measuring ruler): print/engrave in-house with
  `docker exec forestry_fastapi python -m tools.print_qr_plates --registry-prefix GA- --out /media/scans/plaques`
  (A4 PDF at 100 % + 1:1 SVG for laser engravers).
- Training data: scans measured with a tape/caliper keep their DBH photo and
  trunk mask (`SCAN_MEDIA_DIR`); export them with
  `docker exec forestry_fastapi python -m tools.export_trunk_dataset --out /media/scans/_dataset`.

## Users and roles

Four roles: `operator`, `company`, `cooperative`, `admin`.

- At startup the API creates an admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
  (if set) via the bootstrap routine.
- Create or manage users with the CLI:

  ```powershell
  docker exec -it forestry_fastapi python -m tools.create_user --list
  docker exec -it forestry_fastapi python -m tools.create_user `
    --email field@forestry.local --password Field12345 --role operator --company-id 2
  ```

- The admin can also create, deactivate, rename, and reassign users from the
  mobile app (Administration screen).

## Demo dataset

Populate a coherent end-to-end scenario (one `CFAD` → `UFA` -> `AAC`, a
community forest with a `CCC`, harvest/transport/fiscal activity and a
certification) so the Ministère dashboard and the anomaly register show real
data. The tool is idempotent (it re-creates only its own `DEMO` / `GA-DEMO-`
rows):

```powershell
docker exec -it forestry_fastapi python -m tools.seed_demo
# company login: company.demo@forestry.local / Demo12345
# field agent  : agent.demo@forestry.local / Demo12345 (Nzé Obiang, invited to the demo chantier)
```

Sign in through `POST /api/auth/login` to receive a JWT; send it as
`Authorization: Bearer <token>` for role-scoped endpoints.

## Running the mobile app

```powershell
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go. To reach the backend from a physical phone, set
the gateway URL to your machine's LAN IP in `mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000
```

`EXPO_PUBLIC_API_URL` overrides the fallback in `app.json` (`extra.apiUrl`).
If the phone cannot reach Metro, the Windows Firewall is likely blocking port
8081 — use `npx expo start --tunnel`.

## Native depth sensor (LiDAR / ARCore) — development build

The scanner can read the bark distance from the phone's depth sensor (iPhone /
iPad Pro LiDAR, ARCore Depth on supported Android phones). This native module
(`mobile/modules/depth-sensor`) does not exist in Expo Go, where the app falls
back to the QR plate, the typed distance or the server AI. To try it:

```powershell
cd mobile
npx expo install expo-dev-client
npx expo run:android          # Android Studio + a USB phone, or:
# eas build --profile development --platform android   (Expo account)
npx expo start --dev-client
```

A "Mesurer (capteur)" button then appears next to the distance field on the
capture screen. Validate on a real device before field use.

## Tests and checks

| Area | Command |
| --- | --- |
| Backend lint | `docker exec forestry_fastapi ruff check .` |
| Backend format | `docker exec forestry_fastapi ruff format --check .` |
| Backend tests | `docker exec forestry_fastapi pytest tests -q` |
| Gateway tests | `npm test` (in `backend-node/`) |
| Gateway syntax | `node --check src/index.js` (in `backend-node/`) |
| Mobile typecheck | `npx tsc --noEmit` (in `mobile/`) |
| Mobile tests | `npm test` (in `mobile/`) |
| Stack smoke | `python backend-python/scripts/smoke_stack.py` (stack up) |

`ruff` is not part of `requirements.txt`; install it in the running container
with `docker exec forestry_fastapi pip install -q "ruff==0.16.10"`, or let CI
install it (see `.github/workflows/ci.yml`).

## Repository layout

```
backend-python/      FastAPI app, tests, tools, ingestion, scripts
  app/api/           v1, v2, auth, company, cooperative, admin, knowledge
  app/core/          security (JWT/PBKDF2), deps (RBAC), bootstrap, profiles
  app/services/      db, external clients
  tests/             unit + RBAC + allometrics tests
  tools/             create_user, enrich_status, expand_corpus, import_listings
backend-node/        Express gateway (auth, API key, rate limit, proxy)
db/                  init.sql + numbered migrations
mobile/              Expo app (screens, api client, i18n, storage)
.github/workflows/   CI (backend, gateway, mobile, stack smoke)
Phase1.md, Phase2.md Product specifications
```

## Data and external integrations

- Pl@ntNet (species ID), GBIF/Trefle (validation), Google Earth Engine (canopy).
- IUCN Red List status enrichment requires `IUCN_API_TOKEN`; without it,
  `iucn_status` is empty. After adding the token:
  `python -m tools.enrich_status iucn`, then `python -m tools.expand_corpus build`,
  then re-ingest.
- CITES / EU / CMS listings are imported from the CSVs in `docs/` via
  `python -m tools.import_listings`.

## Notes

- Database migrations are mounted as init scripts in `docker-compose.yml` and
  only run on a fresh volume. To apply a new migration to an existing database,
  pipe it in manually:
  `Get-Content db/migrations/00X.sql | docker exec -i forestry_postgres psql -U forestry -d forestry`.
- After changing `.env`, recreate the affected container
  (`docker compose up -d api`); a plain restart does not reload `env_file`.
- Never commit `.env` or service-account JSON files (both are git-ignored).
