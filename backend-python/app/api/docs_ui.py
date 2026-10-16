"""API documentation (Swagger UI) in the Ministry's visual identity: seal, colours, fonts."""

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse, Response

router = APIRouter()

SEAL = Path(__file__).resolve().parent.parent / "assets" / "seal.jpg"
SWAGGER = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14"

THEME = """
:root { --forest:#1E4429; --forest-deep:#14301E; --olive:#4F5F2A; --gold:#C99A1E; --gold-soft:#D9B04A;
  --sand:#F4F3EC; --ink:#1C2A1F; --muted:#5A6656; --line:#D9DCCF; }
body { margin:0; background:var(--sand); font-family:'Atkinson Hyperlegible', Verdana, sans-serif; color:var(--ink); }
.fn-band { background:var(--forest); color:#F4F3EC; padding:18px 32px; display:flex; align-items:center; gap:22px;
  border-bottom:4px solid var(--gold); position:relative; }
.fn-band img { width:84px; height:56px; object-fit:cover; border-radius:8px; }
.fn-band .over { font-family:'Barlow Semi Condensed', Arial, sans-serif; font-weight:600; letter-spacing:2px;
  text-transform:uppercase; color:var(--gold-soft); font-size:13px; }
.fn-band h1 { margin:2px 0 0; font-family:'Barlow Semi Condensed', Arial, sans-serif; font-size:30px; font-weight:700; }
.fn-band .sub { color:#DCE4D6; font-size:14px; margin-top:2px; }
.fn-flag { height:6px; display:flex; } .fn-flag span { flex:1; }
.swagger-ui .topbar { display:none; }
.swagger-ui, .swagger-ui .info .title, .swagger-ui .opblock-tag, .swagger-ui .opblock .opblock-summary-description,
.swagger-ui .markdown p, .swagger-ui table, .swagger-ui .parameter__name, .swagger-ui .response-col_status
  { font-family:'Atkinson Hyperlegible', Verdana, sans-serif; color:var(--ink); }
.swagger-ui .info .title { font-family:'Barlow Semi Condensed', Arial, sans-serif; color:var(--forest); font-size:34px; }
.swagger-ui .info .title small { background:var(--olive); }
.swagger-ui .info a { color:var(--olive); }
.swagger-ui .opblock-tag { font-family:'Barlow Semi Condensed', Arial, sans-serif; font-size:22px; color:var(--forest);
  border-bottom:1px solid var(--line); }
.swagger-ui .opblock { border-radius:10px; box-shadow:none; border-width:1px; }
.swagger-ui .opblock.opblock-get { background:rgba(79,95,42,.07); border-color:var(--olive); }
.swagger-ui .opblock.opblock-get .opblock-summary-method { background:var(--olive); }
.swagger-ui .opblock.opblock-post { background:rgba(201,154,30,.08); border-color:var(--gold); }
.swagger-ui .opblock.opblock-post .opblock-summary-method { background:var(--gold); color:#14301E; }
.swagger-ui .opblock.opblock-put, .swagger-ui .opblock.opblock-patch { background:rgba(30,68,41,.06); border-color:var(--forest); }
.swagger-ui .opblock.opblock-put .opblock-summary-method, .swagger-ui .opblock.opblock-patch .opblock-summary-method { background:var(--forest); }
.swagger-ui .opblock.opblock-delete { background:rgba(176,58,46,.06); border-color:#B03A2E; }
.swagger-ui .opblock .opblock-summary-method { border-radius:6px; font-family:'Barlow Semi Condensed', Arial, sans-serif; }
.swagger-ui .btn.authorize { color:var(--forest); border-color:var(--forest); }
.swagger-ui .btn.authorize svg { fill:var(--forest); }
.swagger-ui .btn.execute { background:var(--olive); border-color:var(--olive); }
.swagger-ui .scheme-container { background:#FBFBF7; box-shadow:none; border-bottom:1px solid var(--line); }
.swagger-ui section.models { border-color:var(--line); }
"""


def _page(title: str) -> str:
    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="icon" href="/api/docs/seal.jpg">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Barlow+Semi+Condensed:wght@600;700&display=swap">
<link rel="stylesheet" href="{SWAGGER}/swagger-ui.css">
<link rel="stylesheet" href="/api/docs/theme.css">
</head><body>
<header class="fn-band">
  <img src="/api/docs/seal.jpg" alt="Sceau de la République gabonaise">
  <div><div class="over">République gabonaise · Ministère des Eaux et Forêts</div>
  <h1>Foresterie Numérique — API</h1>
  <div class="sub">Interface de programmation ouverte et documentée · traçabilité du bois du Gabon</div></div>
</header>
<div class="fn-flag"><span style="background:#009E60"></span><span style="background:#FCD116"></span><span style="background:#3A75C4"></span></div>
<div id="swagger-ui"></div>
<script src="{SWAGGER}/swagger-ui-bundle.js"></script>
<script>
window.ui = SwaggerUIBundle({{ url: "/api/openapi.json", dom_id: "#swagger-ui", deepLinking: true,
  docExpansion: "none", persistAuthorization: true, defaultModelsExpandDepth: -1 }});
</script>
</body></html>"""


@router.get("/docs", include_in_schema=False)
async def docs() -> HTMLResponse:
    return HTMLResponse(_page("Foresterie Numérique — API"))


@router.get("/docs/theme.css", include_in_schema=False)
async def docs_theme() -> Response:
    return Response(THEME, media_type="text/css")


@router.get("/docs/seal.jpg", include_in_schema=False)
async def docs_seal() -> FileResponse:
    return FileResponse(SEAL, media_type="image/jpeg")
