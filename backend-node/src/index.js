import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";

/**
 * Pure streaming proxy — do NOT add body-parsing middleware here: consuming
 * the request stream before http-proxy forwards it truncates multipart/JSON
 * uploads (upstream then hangs waiting for the declared content-length).
 */
export function buildApp(opts = {}) {
  const {
    fastapiUrl = process.env.FASTAPI_URL || "http://localhost:8000",
    requireApiKey = process.env.REQUIRE_API_KEY === "true",
    apiKey = process.env.API_KEY || "",
    rateWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 120,
    rateLimitIpMax = Number(process.env.RATE_LIMIT_IP_MAX) || 1200,
    rateLimitAuthMax = Number(process.env.RATE_LIMIT_AUTH_MAX) || 30,
    trustProxy = process.env.TRUST_PROXY || "",
  } = opts;

  const app = express();
  // Behind a reverse proxy (nginx, load balancer) set TRUST_PROXY to its hop
  // count so the limits see the client's IP, not the proxy's.
  if (trustProxy) app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  // CORS for the Expo dev client / standalone app
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key"
    );
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // API-key gate. Off by default (local dev); enable with REQUIRE_API_KEY=true.
  const apiAuth = (req, res, next) => {
    if (!requireApiKey) return next();
    const provided = req.get("x-api-key") ?? "";
    if (apiKey && safeEqual(provided, apiKey)) return next();
    return res.status(401).json({
      detail: "Clé API manquante ou invalide. Passez X-API-Key.",
    });
  };

  // Rate limits: per signed-in session (many users share one public IP behind
  // a Ministry or company NAT), a wider cap per IP, and a strict one on sign-in.
  const limiter = (limit, keyGenerator, detail) =>
    rateLimit({
      windowMs: rateWindowMs,
      limit,
      keyGenerator,
      standardHeaders: true,
      legacyHeaders: false,
      message: { detail },
    });
  const ipKey = (req) => ipKeyGenerator(req.ip ?? "");
  const sessionKey = (req) => {
    const auth = req.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return `ip:${ipKey(req)}`;
    return `s:${crypto.createHash("sha256").update(token).digest("hex")}`;
  };
  const ipLimiter = limiter(
    rateLimitIpMax,
    ipKey,
    "Trop de requêtes depuis ce réseau. Réessayez dans une minute."
  );
  const sessionLimiter = limiter(
    rateLimitMax,
    sessionKey,
    "Trop de requêtes. Réessayez dans une minute."
  );
  const authLimiter = limiter(
    rateLimitAuthMax,
    ipKey,
    "Trop de tentatives de connexion. Réessayez dans une minute."
  );

  app.use("/api", apiAuth);
  app.use("/api", ipLimiter);
  app.use("/api/auth/login", authLimiter);
  app.use("/api", sessionLimiter);

  const proxy = createProxyMiddleware({
    target: fastapiUrl,
    changeOrigin: true,
    // mount at root (Express would strip an "/api" mount prefix before the
    // proxy sees the path) and filter explicitly instead
    pathFilter: (path) => path.startsWith("/api"),
    selfHandleResponse: false,
    on: {
      error: (err, req, res) => {
        console.error(`[gateway] proxy error ${req.method} ${req.url}: ${err.message}`);
        if (!res.headersSent) {
          res.status(502).json({ detail: "Service scientifique indisponible" });
        }
      },
    },
  });

  app.get("/health", async (_req, res) => {
    try {
      const r = await fetch(`${fastapiUrl}/health`);
      const body = await r.json();
      res.json({ status: "ok", upstream: body });
    } catch {
      res.status(503).json({ status: "degraded", upstream: null });
    }
  });

  app.use(proxy);
  return app;
}

/** Constant-time comparison of two strings (length leaks via hash, not timing). */
export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function main() {
  const app = buildApp();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[gateway] listening on :${PORT}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}