"""Compose-stack smoke test.

Boots-agnostic: point it at a running gateway + API (see docker-compose.yml).
Needs no external secrets, so it runs in CI to catch runtime import regressions
that image builds alone cannot detect (e.g. the cv2/opencv-headless breakage).

Checks
  1. API /health returns 200 {"status":"ok"}
  2. Gateway /health returns 200 with a healthy upstream (public endpoint)
  3. Gateway forwards /api/v2/process-scan to FastAPI (invalid body -> 422)
  4. Gateway forwards /api/v1/process-scan to FastAPI (empty form -> 422),
     which proves the cv2-dependent v1 module imports inside the container.
  5. When the gateway enforces authentication (SMOKE_REQUIRE_API_KEY=true):
     missing/wrong X-API-Key -> 401, and proxied calls carry a rate-limit header.

Env: GATEWAY_URL (default http://localhost:3000), API_URL (default http://localhost:8000),
     SMOKE_API_KEY, SMOKE_REQUIRE_API_KEY (true|false).
Exits non-zero on the first failure.
"""

from __future__ import annotations

import os
import sys

import httpx

GATEWAY = os.getenv("GATEWAY_URL", "http://localhost:3000").rstrip("/")
API = os.getenv("API_URL", "http://localhost:8000").rstrip("/")

SMOKE_API_KEY = os.getenv("SMOKE_API_KEY") or None
SMOKE_REQUIRE_API_KEY = os.getenv("SMOKE_REQUIRE_API_KEY", "false").lower() == "true"

_checks: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    _checks.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  -> ' + detail) if detail else ''}")


def main() -> int:
    with httpx.Client(timeout=20.0) as client:
        headers = {"X-API-Key": SMOKE_API_KEY} if SMOKE_API_KEY else None

        # 1. API health
        try:
            r = client.get(f"{API}/health")
            body = (
                r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            )
            check(
                "api /health",
                r.status_code == 200 and body.get("status") == "ok",
                f"{r.status_code} {body}",
            )
        except Exception as exc:
            check("api /health", False, repr(exc))

        # 2. Gateway health (public: never key-gated)
        try:
            r = client.get(f"{GATEWAY}/health")
            body = r.json()
            upstream = body.get("upstream") or {}
            check(
                "gateway /health upstream",
                r.status_code == 200 and upstream.get("status") == "ok",
                f"{r.status_code} {body}",
            )
        except Exception as exc:
            check("gateway /health upstream", False, repr(exc))

        # 3. Optional API-key gate (enabled with REQUIRE_API_KEY=true)
        if SMOKE_REQUIRE_API_KEY:
            try:
                r = client.post(f"{GATEWAY}/api/v2/process-scan", json={})
                check(
                    "gateway rejects missing key (401)",
                    r.status_code == 401,
                    f"status={r.status_code}",
                )
            except Exception as exc:
                check("gateway rejects missing key (401)", False, repr(exc))

            if SMOKE_API_KEY:
                try:
                    r = client.post(
                        f"{GATEWAY}/api/v2/process-scan",
                        json={},
                        headers={"X-API-Key": "wrong-key"},
                    )
                    check(
                        "gateway rejects wrong key (401)",
                        r.status_code == 401,
                        f"status={r.status_code}",
                    )
                except Exception as exc:
                    check("gateway rejects wrong key (401)", False, repr(exc))

        # 4. Gateway -> FastAPI JSON forwarding (v2)
        try:
            r = client.post(f"{GATEWAY}/api/v2/process-scan", json={}, headers=headers)
            check("gateway -> v2 (422 on empty)", r.status_code == 422, f"status={r.status_code}")
            rate_headers = any(k.startswith("ratelimit") for k in (r.headers or {}))
            check(
                "gateway rate-limit headers present",
                rate_headers,
                "ratelimit" if rate_headers else "missing",
            )
        except Exception as exc:
            check("gateway -> v2 (422 on empty)", False, repr(exc))

        # 5. Gateway -> FastAPI multipart forwarding (v1, imports cv2)
        try:
            r = client.post(f"{GATEWAY}/api/v1/process-scan", data={}, headers=headers)
            check("gateway -> v1 (422, cv2 loads)", r.status_code == 422, f"status={r.status_code}")
        except Exception as exc:
            check("gateway -> v1 (422, cv2 loads)", False, repr(exc))

    failed = [c for c in _checks if not c[1]]
    print(f"\n{len(_checks) - len(failed)}/{len(_checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
