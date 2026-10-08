import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const PORT = process.env.PORT || 3000;
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

// Pure streaming proxy — do NOT add body-parsing middleware here: consuming
// the request stream before http-proxy forwards it truncates multipart/JSON
// uploads (upstream then hangs waiting for the declared content-length).

// CORS for the Expo dev client / standalone app
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const proxy = createProxyMiddleware({
  target: FASTAPI_URL,
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
    const r = await fetch(`${FASTAPI_URL}/health`);
    const body = await r.json();
    res.json({ status: "ok", upstream: body });
  } catch {
    res.status(503).json({ status: "degraded", upstream: null });
  }
});

app.use(proxy);

app.listen(PORT, () => {
  console.log(`[gateway] listening on :${PORT} -> ${FASTAPI_URL}`);
});
