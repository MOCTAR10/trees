"""Compose-stack smoke test.

Boots-agnostic: point it at a running gateway + API (see docker-compose.yml).
Needs no external secrets, so it runs in CI to catch runtime import regressions
that image builds alone cannot detect (e.g. the cv2/opencv-headless breakage).

Checks
  1. API /health returns 200 {"status":"ok"}
  2. Gateway /health returns 200 with a healthy upstream
  3. Gateway forwards /api/v2/process-scan to FastAPI (invalid body -> 422)
  4. Gateway forwards /api/v1/process-scan to FastAPI (empty form -> 422),
     which proves the cv2-dependent v1 module imports inside the container.

Env: GATEWAY_URL (default http://localhost:3000), API_URL (default http://localhost:8000).
Exits non-zero on the first failure.
"""

from __future__ import annotations

import os
import sys

import httpx

GATEWAY = os.getenv("GATEWAY_URL", "http://localhost:3000").rstrip("/")
API = os.getenv("API_URL", "http://localhost:8000").rstrip("/")

_checks: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    _checks.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  -> ' + detail) if detail else ''}")


def main() -> int:
    with httpx.Client(timeout=20.0) as client:
        # 1. API health
        try:
            r = client.get(f"{API}/health")
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            check("api /health", r.status_code == 200 and body.get("status") == "ok", f"{r.status_code} {body}")
        except Exception as exc:  # noqa: BLE001 - report, do not crash
            check("api /health", False, repr(exc))

        # 2. Gateway health (upstream reachability through the proxy config)
        try:
            r = client.get(f"{GATEWAY}/health")
            body = r.json()
            upstream = body.get("upstream") or {}
            check(
                "gateway /health upstream",
                r.status_code == 200 and upstream.get("status") == "ok",
                f"{r.status_code} {body}",
            )
        except Exception as exc:  # noqa: BLE001
            check("gateway /health upstream", False, repr(exc))

        # 3. Gateway -> FastAPI JSON forwarding (v2)
        try:
            r = client.post(f"{GATEWAY}/api/v2/process-scan", json={})
            check("gateway -> v2 (422 on empty)", r.status_code == 422, f"status={r.status_code}")
        except Exception as exc:  # noqa: BLE001
            check("gateway -> v2 (422 on empty)", False, repr(exc))

        # 4. Gateway -> FastAPI multipart forwarding (v1, imports cv2)
        try:
            r = client.post(f"{GATEWAY}/api/v1/process-scan", data={})
            check("gateway -> v1 (422, cv2 loads)", r.status_code == 422, f"status={r.status_code}")
        except Exception as exc:  # noqa: BLE001
            check("gateway -> v1 (422, cv2 loads)", False, repr(exc))

    failed = [c for c in _checks if not c[1]]
    print(f"\n{len(_checks) - len(failed)}/{len(_checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
