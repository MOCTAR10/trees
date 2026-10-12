"""Phase 1 endpoint: full measurement pipeline -> structured forestry report."""

import json
import logging

import cv2
import numpy as np
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.config import get_settings
from app.core.chapman_richards import estimate_age_for_species
from app.core.deps import get_optional_user
from app.core.growth_models import estimate_age_by_integration
from app.core.height_diameter import estimate_height_m
from app.core.species_data import resolve_species
from app.models.schemas import V1Report
from app.services import db, gbif, gee, groq_llm, pdf_report, plantnet, rag, soilgrids
from app.services.vision import measure_dbh

router = APIRouter()
logger = logging.getLogger(__name__)


def _decode(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Image décodable requise")
    return image


async def _read_capped(upload: UploadFile, limit: int) -> bytes:
    """Read an upload up to `limit` bytes, rejecting anything larger (413)."""
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Image trop volumineuse (max {limit // (1024 * 1024)} Mo)",
        )
    return data


def _bark_health(image_bgr: np.ndarray) -> str:
    """Heuristic health read from bark texture (Laplacian energy + dark spots)."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    dark_ratio = float((gray < 40).mean())
    if dark_ratio > 0.35:
        return "anomalie_sombre_possible"
    if lap_var < 80:
        return "surface_lisse_a_verifier"
    return "saine_apparence"


_ORGAN_ALIASES = {
    "bark": "bark",
    "trunk": "bark",
    "ecorce": "bark",
    "écorce": "bark",
    "leaf": "leaf",
    "leaves": "leaf",
    "feuille": "leaf",
    "feuilles": "leaf",
    "flower": "flower",
    "fleur": "flower",
    "fruit": "fruit",
    "whole": "auto",
    "habit": "auto",
    "habitat": "auto",
    "auto": "auto",
}

# Lower rank = more informative for identification (Pl@ntNet organ priority).
_ORGAN_PRIORITY = {"flower": 0, "fruit": 1, "leaf": 2, "auto": 3, "bark": 4}
_PLANTNET_MAX_IMAGES = 5
_PER_ORGAN_CAP = 3


def _norm_organ(value: str | None) -> str:
    """Map a free-form organ label to a Pl@ntNet organ (bark/leaf/flower/fruit/auto)."""
    if not value:
        return "auto"
    return _ORGAN_ALIASES.get(value.strip().lower(), "auto")


async def _collect_views(
    limit: int,
    singulars: list[tuple[UploadFile | None, str]],
    images: list[UploadFile] | None,
    organs: list[str] | None,
    azimuths: list[int] | None,
) -> list[dict]:
    """Normalise legacy singular fields + repeated lists into decoded view dicts."""
    raw: list[tuple[bytes, str, int | None]] = []
    for upload, organ in singulars:
        if upload is not None:
            raw.append((await _read_capped(upload, limit), organ, None))
    for i, upload in enumerate(images or []):
        if upload is None:
            continue
        organ = _norm_organ(organs[i]) if organs and i < len(organs) else "auto"
        azimuth = azimuths[i] if azimuths and i < len(azimuths) else None
        if azimuth is not None and azimuth < 0:
            azimuth = None
        raw.append((await _read_capped(upload, limit), organ, azimuth))

    views: list[dict] = []
    for data, organ, azimuth in raw:
        image = _decode(data)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        views.append(
            {
                "bytes": data,
                "organ": organ,
                "azimuth": azimuth,
                "bgr": image,
                "sharpness": float(cv2.Laplacian(gray, cv2.CV_64F).var()),
            }
        )
    return views


def _select_views(views: list[dict], max_images: int = _PLANTNET_MAX_IMAGES) -> list[dict]:
    """Pick the most informative views for Pl@ntNet (organ priority, then sharpness)."""
    ordered = sorted(views, key=lambda v: (_ORGAN_PRIORITY.get(v["organ"], 3), -v["sharpness"]))
    selected: list[dict] = []
    per_organ: dict[str, int] = {}
    for view in ordered:
        if len(selected) >= max_images:
            break
        organ = view["organ"]
        if per_organ.get(organ, 0) >= _PER_ORGAN_CAP:
            continue
        selected.append(view)
        per_organ[organ] = per_organ.get(organ, 0) + 1
    return selected


def _measure_dbh_multi(
    views: list[dict], ar_depth_m: float | None, focal_px: float | None
) -> tuple[float | None, str, float | None]:
    """Average DBH across trunk/bark views (falls back to a single measurement)."""
    if not (ar_depth_m and focal_px):
        return None, "mock", None
    trunk_views = [v for v in views if v["organ"] == "bark"] or views
    dbhs: list[float] = []
    confs: list[float] = []
    methods: list[str] = []
    for view in trunk_views:
        try:
            measurement = measure_dbh(view["bgr"], depth_m=ar_depth_m, focal_px=focal_px)
        except RuntimeError as exc:
            logger.warning("DBH measurement skipped: %s", exc)
            continue
        dbhs.append(measurement.dbh_cm)
        methods.append(measurement.method)
        confs.append(measurement.confidence or 0.0)
    if not dbhs:
        return None, "mock", None
    if len(dbhs) == 1:
        return dbhs[0], methods[0], confs[0]
    return sum(dbhs) / len(dbhs), "multi_view_avg", sum(confs) / len(confs)


def _aggregate_health(views: list[dict]) -> str:
    """Worst-case health read across bark views (falls back to the first view)."""
    trunk_views = [v for v in views if v["organ"] == "bark"] or views
    readings = [_bark_health(v["bgr"]) for v in trunk_views]
    for bad in ("anomalie_sombre_possible", "surface_lisse_a_verifier"):
        if bad in readings:
            return bad
    return readings[0] if readings else "saine_apparence"


@router.post("/process-scan", response_model=V1Report)
async def process_scan(
    trunk_image: UploadFile | None = File(None, description="Vue écorce / tronc (legacy)"),
    leaf_image: UploadFile | None = File(None, description="Vue feuilles (legacy)"),
    habitat_image: UploadFile | None = File(None, description="Vue habitat (legacy)"),
    images: list[UploadFile] | None = File(
        None, description="Vues multiples (organes fournis par le paramètre organs)"
    ),
    organs: list[str] | None = Form(
        None, description="Organe de chaque vue: bark/leaf/flower/fruit/whole"
    ),
    azimuths: list[int] | None = Form(
        None, description="Azimut (degrés) de chaque vue autour du tronc"
    ),
    latitude: float = Form(...),
    longitude: float = Form(...),
    ar_depth_m: float | None = Form(None, description="Distance tronc- téléphone à 1,30 m"),
    focal_px: float | None = Form(None, description="Focale caméra en pixels"),
    user: dict | None = Depends(get_optional_user),
):
    limit = get_settings().max_image_bytes
    views = await _collect_views(
        limit,
        [(trunk_image, "bark"), (leaf_image, "leaf"), (habitat_image, "auto")],
        images,
        organs,
        azimuths,
    )
    if not views:
        raise HTTPException(status_code=400, detail="Au moins une image est requise")

    # --- STEP 2: species identification (Pl@ntNet multi-organ fusion) ---
    species_name = None
    species_score = None
    try:
        selected = _select_views(views)
        pn = await plantnet.identify(
            images=[v["bytes"] for v in selected],
            organs=[v["organ"] for v in selected],
            lang="fr",
        )
        species_name = pn.scientific_name
        species_score = pn.score
    except Exception as exc:
        logger.warning("Pl@ntNet identification skipped: %s", exc)

    # --- GBIF geographic ecosystem cross-check ---
    if species_name:
        try:
            check = await gbif.validate_species_for_location(species_name, latitude, longitude)
            if not check["valid"] and (species_score or 0) < 0.5:
                species_name = None  # low confidence + no local occurrences
        except Exception as exc:
            logger.warning("GBIF location cross-check skipped: %s", exc)

    # --- STEP 3: DBH via YOLO+OpenCV hybrid (averaged over trunk/bark views) ---
    dbh_cm, dbh_method, dbh_conf = _measure_dbh_multi(views, ar_depth_m, focal_px)

    # --- STEP 4: geospatial context ---
    soil = None
    try:
        soil_data = await soilgrids.fetch_soil(latitude, longitude)
        soil = soil_data["soil_class"] if soil_data else None
    except Exception as exc:
        logger.warning("SoilGrids lookup skipped: %s", exc)

    fcd_data = await gee.canopy_density(latitude, longitude)
    fcd = fcd_data["fcd"]

    # --- STEP 5: age estimation ---
    height = estimate_height_m(dbh_cm, species_name) if dbh_cm else None
    age, model_label = None, None
    if dbh_cm and species_name:
        try:
            age, model_label = estimate_age_for_species(
                dbh_cm, species_name, canopy_density_fcd=fcd
            )
            engone = estimate_age_by_integration(dbh_cm, species_name)
            if engone is not None:
                model_label += f" | engone2013_crosscheck={engone:.0f}y"
        except ValueError:
            model_label = "asymptote_reached_undefined"

    # --- Health heuristic (worst-case across bark views) ---
    health = _aggregate_health(views)

    # --- STEP 6: grounded retrieval (Phase-1 RAG) + French narrative via Groq ---
    profile = resolve_species(species_name)
    rag_chunks = []
    try:
        rag_chunks = await rag.query_forestry(
            query=(
                f"{species_name or 'espèce tropicale'} croissance diamètre densité du bois "
                "allométrie hauteur biomasse"
            ),
            top_k=4,
            species=species_name,
            soil_type=soil,
        )
    except Exception as exc:
        logger.warning("RAG retrieval skipped: %s", exc)
        rag_chunks = []
    rag_sources = list(dict.fromkeys(c.source for c in rag_chunks if c.source)) or None
    rag_context = "\n".join(f"- [{c.doc_type}] {c.content}" for c in rag_chunks)

    narrative = None
    try:
        narrative = await groq_llm.chat_text(
            system_prompt=(
                "Tu es un ingénieur forestier spécialisé des forêts du Bassin du Congo. "
                "Rédige un récit professionnel et chaleureux en français (120-180 mots) sur cet arbre : "
                "espèce, âge estimé, état sanitaire, rôle écologique et contexte climatique historique. "
                "Appuie-toi uniquement sur les connaissances de référence fournies et n'invente pas de chiffres."
            ),
            user_prompt=(
                f"Espèce: {species_name or 'inconnue'}"
                f"{' (' + profile.common_name_fr + ')' if profile else ''}. "
                f"DBH: {dbh_cm or 'N/A'} cm. Âge estimé: {age or 'N/A'} ans. "
                f"Sol: {soil or 'inconnu'}. Canopée (FCD): {fcd}. Santé: {health}.\n"
                f"Connaissances de référence (RAG):\n{rag_context or 'non disponible'}"
            ),
        )
    except Exception as exc:
        logger.warning("Groq narrative skipped: %s", exc)

    # --- Persist ---
    image_urls: dict[str, list[str]] = {}
    for i, view in enumerate(views):
        image_urls.setdefault(view["organ"], []).append(f"stored://{view['organ']}/{i}")
    view_meta = [
        {"organ": v["organ"], "azimuth": v["azimuth"], "sharpness": round(v["sharpness"], 1)}
        for v in views
    ]
    try:
        await db.execute(
            """
            INSERT INTO tree_scans (
                species_scientific_name, species_confidence,
                geom, measured_dbh_cm, dbh_method, dbh_confidence,
                estimated_height_m, estimated_age_years, age_model_used,
                soil_type, canopy_density_fcd, health_status, image_trunk_url, image_leaf_url,
                image_habitat_url, ar_depth_m, camera_focal_px, user_id,
                image_urls, view_meta
            ) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21::jsonb)
            RETURNING id
            """,
            species_name,
            species_score,
            latitude,
            longitude,
            dbh_cm,
            dbh_method,
            dbh_conf,
            height,
            age,
            model_label,
            soil,
            fcd,
            health,
            "stored://trunk",
            "stored://leaf",
            "stored://habitat",
            ar_depth_m,
            focal_px,
            user["id"] if user else None,
            json.dumps(image_urls),
            json.dumps(view_meta),
        )
    except Exception as exc:
        logger.warning("v1 persistence failed (report still returned): %s", exc)

    return V1Report(
        species_scientific_name=species_name,
        species_common_name_fr=profile.common_name_fr if profile else None,
        species_confidence=species_score,
        measured_dbh_cm=dbh_cm,
        dbh_method=dbh_method,
        dbh_confidence=dbh_conf,
        estimated_height_m=height,
        estimated_age_years=round(age, 1) if age else None,
        age_model_used=model_label,
        health_status=health,
        soil_type=soil,
        canopy_density_fcd=fcd,
        narrative_fr=narrative,
        rag_sources=rag_sources,
    )


@router.post("/report/pdf")
async def report_pdf(report: V1Report = Body(...)):
    """Render a previously computed V1 report as a branded PDF."""
    pdf = pdf_report.render_measurement_pdf(report.model_dump())
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="rapport_forestier.pdf"'},
    )
