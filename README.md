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
| Scientific core | `backend-python/` | FastAPI, Ultralytics YOLOv11, OpenCV, LlamaIndex-style RAG, Groq, Google Earth Engine |
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
