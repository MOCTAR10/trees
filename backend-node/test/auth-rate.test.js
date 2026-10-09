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

test("safeEqual: constant-time comparison works and rejects mismatches", () => {
  assert.equal(safeEqual("abc123", "abc123"), true);
  assert.equal(safeEqual("abc123", "abc124"), false);
  assert.equal(safeEqual("abc123", ""), false);
});