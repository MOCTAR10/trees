"""Scenario client for the pilot dataset and the end-to-end workflow suite.

Talks to the API either in-process (``TestClient``) or over HTTP (``base_url``,
e.g. the running stack in CI). Every call states the status it expects, so
building the pilot dataset doubles as a functional check of the workflow rules:
an allowed step must succeed and a forbidden one must be refused.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

import asyncpg
import httpx

from app.config import get_settings


class ScenarioError(AssertionError):
    pass


@dataclass
class Step:
    actor: str
    method: str
    path: str
    status: int
    ok: bool
    note: str = ""
    expected: str = ""
    ms: float = 0.0


@dataclass
class Pilot:
    http: Any
    tokens: dict[str, str] = field(default_factory=dict)
    steps: list[Step] = field(default_factory=list)

    @classmethod
    def connect(cls, base_url: str | None = None) -> Pilot:
        if base_url:
            key = os.environ.get("PILOT_API_KEY")
            headers = {"X-API-Key": key} if key else {}
            return cls(httpx.Client(base_url=base_url, timeout=60, headers=headers))
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)
        client.__enter__()
        return cls(client)

    def close(self) -> None:
        exit_ = getattr(self.http, "__exit__", None)
        if exit_ is not None:
            exit_(None, None, None)
        else:
            self.http.close()

    def login(self, alias: str, email: str, password: str) -> None:
        r = self.http.post("/api/auth/login", json={"email": email, "password": password})
        if r.status_code != 200:
            raise ScenarioError(
                f"Connexion impossible pour {email}: {r.status_code} {r.text[:200]}"
            )
        body = r.json()
        self.tokens[alias] = body.get("access_token") or body.get("token")

    def call(
        self,
        actor: str,
        method: str,
        path: str,
        json: Any = None,
        expect: int | tuple[int, ...] = (200, 201),
        note: str = "",
        files: Any = None,
    ) -> Any:
        headers = {"Authorization": f"Bearer {self.tokens[actor]}"} if actor in self.tokens else {}
        started = time.perf_counter()
        r = self.http.request(method, path, json=json, files=files, headers=headers)
        elapsed = (time.perf_counter() - started) * 1000
        expected = (expect,) if isinstance(expect, int) else expect
        ok = r.status_code in expected
        self.steps.append(
            Step(
                actor,
                method,
                path.split("?")[0],
                r.status_code,
                ok,
                note,
                "/".join(str(e) for e in expected),
                round(elapsed, 1),
            )
        )
        if not ok:
            raise ScenarioError(
                f"{note or path}: {actor} {method} {path} → {r.status_code}"
                f" (attendu {expected}) {r.text[:300]}"
            )
        try:
            return r.json()
        except ValueError:
            return r.content

    def get(self, actor: str, path: str, **kw) -> Any:
        return self.call(actor, "GET", path, expect=kw.pop("expect", 200), **kw)

    def post(self, actor: str, path: str, json: Any = None, **kw) -> Any:
        return self.call(actor, "POST", path, json=json, **kw)

    def patch(self, actor: str, path: str, json: Any = None, **kw) -> Any:
        return self.call(actor, "PATCH", path, json=json, **kw)

    def put(self, actor: str, path: str, json: Any = None, **kw) -> Any:
        return self.call(actor, "PUT", path, json=json, **kw)

    def refused(self, actor: str, method: str, path: str, json: Any, status: int, note: str) -> Any:
        """A step the rules must refuse (blocked declaration, wrong holder…)."""
        return self.call(actor, method, path, json=json, expect=status, note=note)

    def summary(self) -> dict[str, int]:
        refused = sum(1 for s in self.steps if s.status >= 400)
        return {"steps": len(self.steps), "refused_as_expected": refused}

    def report(self, path: str, title: str, notes: list[str] | None = None) -> None:
        """Write the scenario as JSON and as a Markdown summary (``<path>.md``)."""
        steps = [s.__dict__ for s in self.steps]
        summary = {
            **self.summary(),
            "failed": sum(1 for s in self.steps if not s.ok),
            "slowest_ms": max((s.ms for s in self.steps), default=0),
        }
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(
                {"title": title, "summary": summary, "notes": notes or [], "steps": steps},
                fh,
                ensure_ascii=False,
                indent=1,
            )
        lines = [
            f"### {title}",
            "",
            f"**{summary['steps']}** appels API · **{summary['refused_as_expected']}** refus"
            f" attendus · **{summary['failed']}** écart(s) · plus lent {summary['slowest_ms']:.0f} ms",
            "",
        ]
        lines += [f"- {n}" for n in notes or []]
        refusals = [s for s in self.steps if s.status >= 400]
        if refusals:
            lines += [
                "",
                "| Règle vérifiée (refus attendu) | Acteur | Appel | Statut |",
                "| --- | --- | --- | --- |",
            ]
            lines += [
                f"| {s.note or '—'} | {s.actor} | `{s.method} {s.path}` | {s.status} |"
                for s in refusals
            ]
        failed = [s for s in self.steps if not s.ok]
        if failed:
            lines += ["", "**Écarts**", ""]
            lines += [
                f"- {s.actor} `{s.method} {s.path}` → {s.status} (attendu {s.expected}) {s.note}"
                for s in failed
            ]
        with open(f"{path}.md", "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")


def database_url() -> str:
    url = os.environ.get("PILOT_DATABASE_URL") or get_settings().database_url
    return url.replace("postgresql+asyncpg://", "postgresql://")


def sql(statements: list[tuple[str, tuple]]) -> list[list[dict]]:
    """Run raw SQL on a dedicated connection (geometry, scans, reset)."""

    async def run() -> list[list[dict]]:
        conn = await asyncpg.connect(database_url())
        try:
            out = []
            for query, args in statements:
                rows = await conn.fetch(query, *args)
                out.append([dict(r) for r in rows])
            return out
        finally:
            await conn.close()

    return asyncio.run(run())
