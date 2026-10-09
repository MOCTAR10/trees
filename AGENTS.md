# AGENTS.md

Guidance for automated agents working in this repository. See `README.md` for
the human-facing overview.

## Golden rules

- Keep CI green on every push. CI is the gate; do not push while a run is in
  progress (the workflow uses `cancel-in-progress: true`). The required status
  check is `CI · success`.
- Do not add code comments unless explicitly asked.
- Never commit `.env` or any secret/service-account JSON. `.env` is git-ignored
  at every level; `mobile/.env` is ignored too.
- Do not commit unless explicitly asked. Never force-push.

## Commands

Backend (`backend-python/`, runs in the `forestry_fastapi` container):

```powershell
docker exec forestry_fastapi ruff check .
docker exec forestry_fastapi ruff format --check .
docker exec forestry_fastapi pytest tests -q
```

Gateway (`backend-node/`):

```
npm test
node --check src/index.js
```

Mobile (`mobile/`):

```
npx tsc --noEmit
```

Full stack smoke (stack must be running):

```
python backend-python/scripts/smoke_stack.py
```

## Conventions

- Python: type hints, `async` handlers, `ruff` (version `0.16.10` in CI). No
  new runtime dependencies without a strong reason; JWT/auth uses the standard
  library.
- Database access goes through `app/services/db.py` (`fetch_one`, `fetch_all`,
  `execute`). Tests monkeypatch these functions in-memory (see
  `tests/test_rbac.py`).
- Gateway is a proxy only; it does not implement user auth. User sessions are
  JWTs signed by FastAPI and validated by `app/core/deps.py`.
- Mobile has no navigation library; `App.tsx` routes with a `phase` state
  machine plus role checks. French UI strings live in `src/i18n/fr.ts`.

## CI

`.github/workflows/ci.yml` runs four jobs (backend, gateway, mobile, stack) and
gates on `CI · success`. `concurrency.cancel-in-progress` cancels superseded
runs, so wait for the previous run to finish before pushing.

## Gotchas

- `db/` migrations are Docker init scripts and only apply to a fresh volume.
  Apply to a live DB manually:
  `Get-Content db/migrations/00X.sql | docker exec -i forestry_postgres psql -U forestry -d forestry`.
- `.env` changes require recreating the container (`docker compose up -d api`).
- `ruff` is installed by CI, not listed in `requirements.txt`. In a running
  container install it ad hoc (lost on container recreation).
- IUCN enrichment is blocked until `IUCN_API_TOKEN` is provided.
