"""Phase 1 endpoint: full measurement pipeline -> structured forestry report."""

import io
import json
import logging
import math
import statistics
from dataclasses import dataclass, field

import cv2
import numpy as np
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

from app.config import get_settings
from app.core.chapman_richards import estimate_age_for_species
from app.core.deps import get_optional_user
from app.core.geometry import DEFAULT_FOCAL_35MM, focal_px_from_35mm
from app.core.growth_models import estimate_age_by_integration
from app.core.height_diameter import estimate_height_m
from app.core.species_data import resolve_species
from app.models.schemas import V1Report
from app.services import db, gbif, gee, groq_llm, pdf_report, plantnet, rag, soilgrids
from app.services.biomass_engine import compute_residues
from app.services.vision import PLAUSIBLE_DBH_CM, measure_dbh

router = APIRouter()
logger = logging.getLogger(__name__)

_EXIF_IFD = 0x8769
_EXIF_FOCAL_35MM = 0xA405

#: IPCC default carbon fraction of tropical dry biomass, and the CO2/C mass ratio.
CARBON_FRACTION = 0.47
CO2_PER_C = 44.0 / 12.0

#: Height (m) a clinometer / manual reading must fall in to replace the H-D curve.
PLAUSIBLE_HEIGHT_M = (1.3, 80.0)


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
    "dbh": "dbh",
}

# Lower rank = more informative for identification (Pl@ntNet organ priority).
# A DBH shot frames the whole trunk width from ~2 m: weak for identification.
_ORGAN_PRIORITY = {"flower": 0, "fruit": 1, "leaf": 2, "auto": 3, "bark": 4, "dbh": 5}
_PLANTNET_ORGAN = {"dbh": "bark"}
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


def _exif_focal_35mm(data: bytes) -> float | None:
    """35 mm-equivalent focal length stored in a photo's EXIF, if any."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            exif = img.getexif()
            value = exif.get_ifd(_EXIF_IFD).get(_EXIF_FOCAL_35MM) or exif.get(_EXIF_FOCAL_35MM)
    except Exception:
        return None
    try:
        focal = float(value)
    except (TypeError, ValueError):
        return None
    return focal if focal > 0 else None


def _resolve_focal(
    view: dict, focal_px: float | None, focal_35mm: float | None
) -> tuple[float, str]:
    """Focal length in pixels for one view, with the provenance of the value."""
    if focal_px and focal_px > 0:
        return focal_px, "focal_client"
    height, width = view["bgr"].shape[:2]
    if focal_35mm and focal_35mm > 0:
        return focal_px_from_35mm(focal_35mm, width, height), "focal_client"
    exif = _exif_focal_35mm(view["bytes"])
    if exif:
        return focal_px_from_35mm(exif, width, height), "focal_exif"
    return focal_px_from_35mm(DEFAULT_FOCAL_35MM, width, height), "focal_estimated"


@dataclass
class DbhResolution:
    dbh_cm: float | None
    method: str
    confidence: float | None
    vision_dbh_cm: float | None = None
    uncertainty_cm: float | None = None
    discrepancy_pct: float | None = None
    notes: list[str] = field(default_factory=list)


def _measurement_views(views: list[dict]) -> list[dict]:
    """Views suited to DBH: dedicated DBH shot, else bark, else whole tree."""
    for organ in ("dbh", "bark", "auto"):
        selected = [v for v in views if v["organ"] == organ]
        if selected:
            return selected
    return []


def _vision_dbh(
    views: list[dict],
    ar_depth_m: float | None,
    focal_px: float | None,
    focal_35mm: float | None,
    notes: list[str],
) -> tuple[float | None, str | None, float | None, float | None]:
    """Median DBH over measurement views, gated by plausibility."""
    if not (ar_depth_m and ar_depth_m > 0):
        notes.append("depth_missing")
        return None, None, None, None
    dbhs: list[float] = []
    confs: list[float] = []
    methods: list[str] = []
    for view in _measurement_views(views):
        focal, source = _resolve_focal(view, focal_px, focal_35mm)
        if source not in notes:
            notes.append(source)
        try:
            measurement = measure_dbh(view["bgr"], depth_m=ar_depth_m, focal_px=focal)
        except (RuntimeError, ValueError) as exc:
            logger.warning("DBH measurement skipped: %s", exc)
            continue
        if getattr(measurement, "touches_frame", False):
            if "trunk_exceeds_frame" not in notes:
                notes.append("trunk_exceeds_frame")
            continue
        if not PLAUSIBLE_DBH_CM[0] <= measurement.dbh_cm <= PLAUSIBLE_DBH_CM[1]:
            if "vision_implausible" not in notes:
                notes.append("vision_implausible")
            continue
        dbhs.append(measurement.dbh_cm)
        methods.append(measurement.method)
        confs.append(measurement.confidence or 0.0)
    if not dbhs:
        if not any(n in notes for n in ("trunk_exceeds_frame", "vision_implausible")):
            notes.append("vision_failed")
        return None, None, None, None
    if len(dbhs) == 1:
        return dbhs[0], methods[0], confs[0], None
    spread = (max(dbhs) - min(dbhs)) / 2.0
    return (
        round(statistics.median(dbhs), 2),
        "multi_view_median",
        sum(confs) / len(confs),
        round(spread, 2),
    )


def _resolve_dbh(
    views: list[dict],
    ar_depth_m: float | None,
    focal_px: float | None,
    focal_35mm: float | None,
    circumference_cm: float | None,
    caliper_dbh_cm: float | None,
) -> DbhResolution:
    """Reference measurement (tape/caliper) wins; vision is the cross-check."""
    notes: list[str] = []
    vision, vision_method, vision_conf, spread = _vision_dbh(
        views, ar_depth_m, focal_px, focal_35mm, notes
    )
    reference: float | None = None
    method = None
    confidence = None
    if circumference_cm and circumference_cm > 0:
        reference, method, confidence = circumference_cm / math.pi, "tape_circumference", 0.98
        notes.append("reference_tape")
    elif caliper_dbh_cm and caliper_dbh_cm > 0:
        reference, method, confidence = caliper_dbh_cm, "caliper", 0.95
        notes.append("reference_caliper")
    if reference is not None:
        discrepancy = round((vision - reference) / reference * 100.0, 1) if vision else None
        return DbhResolution(
            dbh_cm=round(reference, 2),
            method=method,
            confidence=confidence,
            vision_dbh_cm=vision,
            uncertainty_cm=None,
            discrepancy_pct=discrepancy,
            notes=notes,
        )
    if vision is None:
        return DbhResolution(None, "unavailable", None, notes=notes)
    return DbhResolution(
        dbh_cm=vision,
        method=vision_method or "vision",
        confidence=vision_conf,
        vision_dbh_cm=vision,
        uncertainty_cm=spread,
        notes=notes,
    )


def _carbon_stock(
    dbh_cm: float | None, species: str | None, height_m: float | None
) -> tuple[float | None, float | None, float | None]:
    """Living-tree stock: AGB (Chave 2014), carbon (AGB+BGB) and CO2e, in kg."""
    if not dbh_cm:
        return None, None, None
    try:
        residues = compute_residues(dbh_cm=dbh_cm, species=species, height_m=height_m)
    except ValueError:
        return None, None, None
    carbon = residues.total_biomass_kg * CARBON_FRACTION
    return (
        round(residues.total_agb_kg, 1),
        round(carbon, 1),
        round(carbon * CO2_PER_C, 1),
    )


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
    ar_depth_m: float | None = Form(None, description="Distance écorce-téléphone (m) à 1,30 m"),
    focal_px: float | None = Form(None, description="Focale caméra en pixels"),
    focal_35mm: float | None = Form(
        None, description="Focale équivalente 35 mm (EXIF FocalLenIn35mmFilm)"
    ),
    circumference_cm: float | None = Form(
        None, gt=0, le=1300, description="Circonférence au ruban à 1,30 m (cm)"
    ),
    caliper_dbh_cm: float | None = Form(
        None, gt=0, le=400, description="Diamètre au compas forestier à 1,30 m (cm)"
    ),
    measured_height_m: float | None = Form(
        None, gt=0, le=100, description="Hauteur totale mesurée (clinomètre ou saisie)"
    ),
    height_source: str | None = Form(None, description="clinometer | manual"),
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
            organs=[_PLANTNET_ORGAN.get(v["organ"], v["organ"]) for v in selected],
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

    # --- STEP 3: DBH — tape/caliper reference, YOLO+OpenCV vision cross-check ---
    dbh = _resolve_dbh(views, ar_depth_m, focal_px, focal_35mm, circumference_cm, caliper_dbh_cm)
    dbh_cm, dbh_method, dbh_conf = dbh.dbh_cm, dbh.method, dbh.confidence

    # --- STEP 4: geospatial context ---
    soil = None
    try:
        soil_data = await soilgrids.fetch_soil(latitude, longitude)
        soil = soil_data["soil_class"] if soil_data else None
    except Exception as exc:
        logger.warning("SoilGrids lookup skipped: %s", exc)

    fcd_data = await gee.canopy_density(latitude, longitude)
    fcd = fcd_data["fcd"]

    # --- STEP 5: height (measured beats the H-D curve) + age estimation ---
    height, height_method = None, None
    if measured_height_m and PLAUSIBLE_HEIGHT_M[0] <= measured_height_m <= PLAUSIBLE_HEIGHT_M[1]:
        height = measured_height_m
        height_method = "clinometer" if height_source == "clinometer" else "manual"
    elif dbh_cm:
        height, height_method = estimate_height_m(dbh_cm, species_name), "hd_curve"
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

    # --- Living carbon stock (Chave 2014 AGB + root:shoot BGB, IPCC fractions) ---
    agb_kg, carbon_kg, co2e_kg = _carbon_stock(dbh_cm, species_name, height)

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
                f"Sol: {soil or 'inconnu'}. Canopée (FCD): {fcd}. Santé: {health}. "
                f"Stock de carbone vivant: {co2e_kg or 'N/A'} kg CO2e.\n"
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
                dbh_vision_cm, dbh_uncertainty_cm, measurement_notes, height_method,
                aboveground_biomass_kg, carbon_stock_kg, co2e_kg,
                image_urls, view_meta
            ) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb, $23, $24, $25, $26, $27::jsonb, $28::jsonb)
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
            dbh.vision_dbh_cm,
            dbh.uncertainty_cm,
            json.dumps(dbh.notes),
            height_method,
            agb_kg,
            carbon_kg,
            co2e_kg,
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
        dbh_vision_cm=dbh.vision_dbh_cm,
        dbh_uncertainty_cm=dbh.uncertainty_cm,
        dbh_discrepancy_pct=dbh.discrepancy_pct,
        measurement_notes=dbh.notes,
        height_method=height_method,
        aboveground_biomass_kg=agb_kg,
        carbon_stock_kg=carbon_kg,
        co2e_kg=co2e_kg,
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
