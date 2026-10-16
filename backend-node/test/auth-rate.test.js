import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";

import { buildApp, safeEqual } from "../src/index.js";

function startUpstream() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ upstream: true, url: req.url }));
  });
  server.start = () =>
    new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  return server;
}

async function startApp(t, opts = {}) {
  const upstream = startUpstream();
  const upstreamPort = await upstream.start();
  const app = buildApp({ fastapiUrl: `http://127.0.0.1:${upstreamPort}`, ...opts });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    server.close();
    upstream.close();
  });
  return base;
}

test("dev mode: no key required, /api is proxied upstream", async (t) => {
  const base = await startApp(t);
  const r = await fetch(`${base}/api/ping`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.upstream, true);
  assert.equal(body.url, "/api/ping");
});

test("auth: 401 without / with wrong key, 200 with the right key", async (t) => {
  const base = await startApp(t, { requireApiKey: true, apiKey: "s3cret" });
  assert.equal((await fetch(`${base}/api/x`)).status, 401);
  assert.equal(
    (await fetch(`${base}/api/x`, { headers: { "X-API-Key": "nope" } })).status,
    401
  );
  const ok = await fetch(`${base}/api/x`, { headers: { "X-API-Key": "s3cret" } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).upstream, true);
});

test("auth: the API documentation is readable without the key, the API is not", async (t) => {
  const base = await startApp(t, { requireApiKey: true, apiKey: "s3cret" });
  for (const path of ["/api/docs", "/api/redoc", "/api/openapi.json", "/api/docs/theme.css", "/api/docs/seal.jpg"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 200, path);
  }
  assert.equal((await fetch(`${base}/api/openapi.json`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${base}/api/docs/../auth/login`)).status, 401);
});

test("auth: /health stays public even when the API key is required", async (t) => {
  const base = await startApp(t, { requireApiKey: true, apiKey: "s3cret" });
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, "ok");
  assert.equal(body.upstream.upstream, true);
});

test("rate limit: 4th request in the window is rejected with 429 + headers", async (t) => {
  const base = await startApp(t, { requireApiKey: true, apiKey: "k", rateLimitMax: 3 });
  const headers = { "X-API-Key": "k" };
  const statuses = [];
  for (let i = 0; i < 4; i += 1) {
    const r = await fetch(`${base}/api/x`, { headers });
    statuses.push(r.status);
    if (i === 0) {
      assert.ok(r.headers.get("ratelimit-limit") || r.headers.get("ratelimit"));
    }
  }
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

test("rate limit: counted per signed-in session, not per shared IP", async (t) => {
  const base = await startApp(t, { rateLimitMax: 2, rateLimitIpMax: 100 });
  const get = (token) =>
    fetch(`${base}/api/x`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);
  assert.deepEqual([await get("a"), await get("a"), await get("a")], [200, 200, 429]);
  assert.deepEqual([await get("b"), await get("b")], [200, 200]);
});

test("rate limit: the per-IP cap still bounds many sessions from one network", async (t) => {
  const base = await startApp(t, { rateLimitMax: 100, rateLimitIpMax: 3 });
  const statuses = [];
  for (const token of ["a", "b", "c", "d"]) {
    const r = await fetch(`${base}/api/x`, { headers: { Authorization: `Bearer ${token}` } });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

test("rate limit: sign-in attempts have their own strict limit", async (t) => {
  const base = await startApp(t, { rateLimitAuthMax: 2 });
  const login = () => fetch(`${base}/api/auth/login`, { method: "POST" }).then((r) => r.status);
  assert.deepEqual([await login(), await login(), await login()], [200, 200, 429]);
  assert.equal((await fetch(`${base}/api/x`)).status, 200);
});

test("safeEqual: constant-time comparison works and rejects mismatches", () => {
  assert.equal(safeEqual("abc123", "abc123"), true);
  assert.equal(safeEqual("abc123", "abc124"), false);
  assert.equal(safeEqual("abc123", ""), false);
});