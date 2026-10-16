"""Phase 1 endpoint: full measurement pipeline -> structured forestry report."""

import asyncio
import io
import json
import logging
import math
import re
import statistics
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel, Field

from app.config import get_settings
from app.core.chapman_richards import estimate_age_for_species
from app.core.deps import get_optional_user
from app.core.geometry import DEFAULT_FOCAL_35MM, diameter_from_edges_cm, focal_px_from_35mm
from app.core.growth_models import estimate_age_by_integration
from app.core.height_diameter import estimate_height_m
from app.core.species_data import resolve_species
from app.models.schemas import V1Report
from app.services import (
    ai_models,
    db,
    forest_watch,
    gee,
    groq_llm,
    pdf_report,
    plantnet,
    projects,
    qr_plate,
    rag,
    soilgrids,
    species_rank,
)
from app.services.biomass_engine import living_carbon
from app.services.vision import PLAUSIBLE_DBH_CM, measure_dbh

router = APIRouter()
logger = logging.getLogger(__name__)

_EXIF_IFD = 0x8769
_EXIF_FOCAL_35MM = 0xA405

#: Height (m) a clinometer / manual reading must fall in to replace the H-D curve.
PLAUSIBLE_HEIGHT_M = (1.3, 80.0)

#: Measurement views sent through SAM 2.1 (each costs a few CPU seconds).
AI_MAX_VIEWS = 2

#: Combined score (Pl@ntNet x Gabon priors) below which the top match is a
#: guess, not an identification.
MIN_SPECIES_SCORE = 0.15

#: Alternatives shown to the operator.
SPECIES_CANDIDATES = 3

#: Confidence factor of a photo DBH whose bark distance was estimated by AI.
AI_DISTANCE_CONFIDENCE = 0.6

#: Confidence of a DBH read from operator-confirmed edges (human in the loop).
OPERATOR_EDGES_CONFIDENCE = 0.9

#: Native depth sensors whose reading beats the QR plate and the typed value.
SENSOR_SOURCES = frozenset({"lidar", "arcore"})

#: DBH methods that are field ground truth (tape / caliper).
REFERENCE_METHODS = frozenset({"tape_circumference", "caliper"})


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


def _operator_edges_measurement(view: dict, depth_m: float, focal_px: float):
    """DBH from the trunk edges the operator confirmed on the photo.

    Edges arrive as fractions of the displayed photo width (robust to EXIF
    rotation); ``cv2.imdecode`` applies the same orientation, so they map onto
    this image's columns. Same tangent geometry as the phone's live preview.
    """
    width = view["bgr"].shape[1]
    left_frac, right_frac = view["edges"]
    dbh_cm = diameter_from_edges_cm(
        left_frac * width, right_frac * width, width / 2.0, focal_px, depth_m
    )
    margin = 2.0 / width
    return SimpleNamespace(
        dbh_cm=round(dbh_cm, 2),
        method="operator_edges",
        confidence=OPERATOR_EDGES_CONFIDENCE,
        touches_frame=left_frac <= margin or right_frac >= 1.0 - margin,
    )


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
        extra = {"mask": view["ai_mask"]} if view.get("ai_mask") is not None else {}
        try:
            if view.get("edges"):
                measurement = _operator_edges_measurement(view, ar_depth_m, focal)
            else:
                measurement = measure_dbh(view["bgr"], depth_m=ar_depth_m, focal_px=focal, **extra)
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


async def _identify_species(
    views: list[dict], latitude: float, longitude: float
) -> tuple[str | None, float | None, list[dict], str | None]:
    """Pl@ntNet (regional flora first) re-ranked with Gabon priors and GBIF.

    Returns the retained name (``None`` below the confidence bar), the raw
    Pl@ntNet score of the best candidate, the ranked candidates and the flora.
    """
    try:
        selected = _select_views(views)
        pn = await plantnet.identify_regional(
            images=[v["bytes"] for v in selected],
            organs=[_PLANTNET_ORGAN.get(v["organ"], v["organ"]) for v in selected],
            lang="fr",
        )
    except Exception as exc:
        logger.warning("Pl@ntNet identification skipped: %s", exc)
        return None, None, [], None
    candidates = getattr(pn, "candidates", None) or (
        [{"scientific_name": pn.scientific_name, "score": pn.score}] if pn.scientific_name else []
    )
    ranked = await species_rank.rerank(candidates, latitude, longitude)
    if not ranked:
        return None, None, [], getattr(pn, "project", None)
    best = ranked[0]
    name = best["scientific_name"] if best["combined"] >= MIN_SPECIES_SCORE else None
    return name, best["score"], ranked[:SPECIES_CANDIDATES], getattr(pn, "project", None)


async def _soil_class(latitude: float, longitude: float) -> str | None:
    try:
        soil_data = await soilgrids.fetch_soil(latitude, longitude)
    except Exception as exc:
        logger.warning("SoilGrids lookup skipped: %s", exc)
        return None
    return soil_data["soil_class"] if soil_data else None


async def _read_plate(
    views: list[dict], focal_px: float | None, focal_35mm: float | None
) -> tuple[qr_plate.PlateReading | None, float | None]:
    """QR plate on the measurement views: (reading, plate distance in m)."""
    plate_cm = get_settings().qr_tag_size_cm
    first: qr_plate.PlateReading | None = None
    for view in _measurement_views(views):
        reading = await asyncio.to_thread(qr_plate.detect, view["bgr"])
        if reading is None:
            continue
        first = first or reading
        focal, _source = _resolve_focal(view, focal_px, focal_35mm)
        distance = qr_plate.distance_m(reading, focal, plate_cm)
        if distance:
            return reading, distance
    return first, None


async def _prepare_ai(views: list[dict], ar_depth_m: float | None) -> float | None:
    """SAM 2.1 trunk cut-out on the measurement views (worker thread).

    When the operator typed no distance, Depth Anything V2 estimates it on the
    first measurement view; returns that estimate (m) or ``None``.
    """
    if not ai_models.enabled():
        return None
    targets = _measurement_views(views)[:AI_MAX_VIEWS]
    for view in targets:
        view["ai_mask"] = await asyncio.to_thread(ai_models.segment_trunk, view["bgr"])
    if (ar_depth_m and ar_depth_m > 0) or not targets:
        return None
    first = targets[0]
    depth = await asyncio.to_thread(ai_models.depth_map, first["bgr"])
    return ai_models.trunk_distance_m(depth, first.get("ai_mask"))


INVENTORY_CODE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{2,39}$")


def _tree_company(user: dict) -> int | None:
    """Company account a field user inventories for (the company itself or the employer)."""
    if user["role"] == "company":
        return user["id"]
    if user["role"] == "operator":
        return user.get("company_id")
    return None


async def _linked_tree_code(tree_code: str | None, user: dict | None) -> tuple[str | None, bool]:
    """Validate the registry tree a scan is attached to (QR / typed code).

    Returns ``(code, to_inventory)``: an unknown code scanned by a field user of a
    company enters the registry as ``inventorie`` when the scan is stored.
    """
    if not tree_code or not tree_code.strip():
        return None, False
    code = tree_code.strip()
    if user is None:
        raise HTTPException(status_code=401, detail="Connexion requise pour lier un arbre")
    tree = await db.fetch_one(
        "SELECT tree_code, company_id FROM tree_registry WHERE tree_code=$1", code
    )
    if tree is None:
        if _tree_company(user) and INVENTORY_CODE.match(code):
            return code, True
        raise HTTPException(status_code=404, detail="Arbre inconnu au registre")
    if user["role"] != "admin" and tree["company_id"] != _tree_company(user):
        raise HTTPException(status_code=403, detail="Arbre d'une autre entreprise")
    return code, False


async def _inventory_tree(
    code: str,
    user: dict,
    species: str | None,
    dbh_cm: float | None,
    latitude: float,
    longitude: float,
    project_id: int | None,
) -> bool:
    """Enter a newly marked stem in the registry (status ``inventorie``)."""
    aac = None
    if project_id:
        aac = await db.fetch_one(
            "SELECT a.id AS aac_id, a.label, m.title_id FROM projects p"
            " JOIN annual_cut_blocks a ON a.id = p.aac_id"
            " JOIN management_units m ON m.id = a.ufa_id WHERE p.id = $1",
            project_id,
        )
    if aac is None and user.get("organization_id"):
        aac = await db.fetch_one(
            "SELECT a.id AS aac_id, a.label, m.title_id FROM annual_cut_blocks a"
            " JOIN management_units m ON m.id = a.ufa_id"
            " JOIN forest_titles t ON t.id = m.title_id"
            " WHERE t.holder_org_id = $1 AND a.geom IS NOT NULL"
            " AND ST_Covers(a.geom, ST_SetSRID(ST_MakePoint($3, $2), 4326))"
            " ORDER BY a.id DESC LIMIT 1",
            user["organization_id"],
            latitude,
            longitude,
        )
    aac = dict(aac) if aac else {}
    try:
        await db.execute(
            "INSERT INTO tree_registry (tree_code, marking_type, geom, species_scientific_name,"
            " measured_dbh_cm, company_id, status, aac_id, aac_label, title_id, custodian_org_id)"
            " VALUES ($1, 'qr', ST_SetSRID(ST_MakePoint($3, $2), 4326), $4, $5, $6, 'inventorie',"
            " $7, $8, $9, $10) ON CONFLICT (tree_code) DO NOTHING",
            code,
            latitude,
            longitude,
            species,
            dbh_cm,
            _tree_company(user),
            aac.get("aac_id"),
            aac.get("label"),
            aac.get("title_id"),
            user.get("organization_id"),
        )
    except Exception as exc:
        logger.warning("inventory of %s failed: %s", code, exc)
        return False
    return True


def _save_labelled_media(views: list[dict], dbh: "DbhResolution") -> str | None:
    """Keep the DBH photo + trunk mask of a reference-measured scan.

    A tape/caliper reading is ground truth: these files form the training set
    for a Gabon-specific trunk model (``tools.export_trunk_dataset``).
    """
    media_root = get_settings().scan_media_dir
    if not media_root or dbh.method not in REFERENCE_METHODS:
        return None
    measured = _measurement_views(views)
    if not measured:
        return None
    key = uuid.uuid4().hex
    folder = Path(media_root) / key
    try:
        folder.mkdir(parents=True, exist_ok=True)
        view = measured[0]
        (folder / "dbh.jpg").write_bytes(view["bytes"])
        if view.get("ai_mask") is not None:
            cv2.imwrite(str(folder / "mask.png"), view["ai_mask"].astype(np.uint8) * 255)
        label = {
            "dbh_cm": dbh.dbh_cm,
            "method": dbh.method,
            "vision_dbh_cm": dbh.vision_dbh_cm,
            "discrepancy_pct": dbh.discrepancy_pct,
            "organ": view["organ"],
        }
        (folder / "label.json").write_text(json.dumps(label), encoding="utf-8")
    except OSError as exc:
        logger.warning("Labelled scan media not saved: %s", exc)
        return None
    return key


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
    tree_code: str | None = Form(None, description="Code registre de l'arbre (QR scanné)"),
    depth_source: str | None = Form(
        None, description="Origine de ar_depth_m : lidar | arcore (capteur) ou saisie"
    ),
    edge_left: float | None = Form(
        None,
        ge=0,
        le=1,
        description="Bord gauche du tronc (fraction de la largeur de la photo DBH)",
    ),
    edge_right: float | None = Form(
        None, ge=0, le=1, description="Bord droit du tronc (fraction de la largeur de la photo DBH)"
    ),
    project_id: int | None = Form(
        None, description="Scan fait pour un chantier / projet (participant actif requis)"
    ),
    user: dict | None = Depends(get_optional_user),
):
    linked_code, to_inventory = await _linked_tree_code(tree_code, user)
    scan_project, project_title, project_note = await projects.resolve_scan_project(
        project_id, user, latitude, longitude
    )
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

    # --- QR plate: a measured distance and the tree's own registry code ---
    plate, plate_distance = await _read_plate(views, focal_px, focal_35mm)
    plate_note = None
    if plate and plate.code and linked_code is None and user is not None:
        try:
            linked_code, to_inventory = await _linked_tree_code(plate.code, user)
        except HTTPException:
            plate_note = "qr_tree_unknown"

    # --- STEPS 2-4 run concurrently: species ID, AI trunk/distance, context ---
    species, ai_distance, soil, fcd_data, forest_checks = await asyncio.gather(
        _identify_species(views, latitude, longitude),
        _prepare_ai(views, ar_depth_m or plate_distance),
        _soil_class(latitude, longitude),
        gee.canopy_density(latitude, longitude),
        forest_watch.check_point(latitude, longitude),
    )
    species_name, species_score, species_candidates, species_flora = species
    fcd = fcd_data["fcd"]

    # --- STEP 3: DBH — tape/caliper reference, SAM 2.1 + OpenCV vision check ---
    if edge_left is not None and edge_right is not None and edge_right > edge_left:
        dbh_views = [v for v in views if v["organ"] == "dbh"]
        if dbh_views:
            dbh_views[0]["edges"] = (edge_left, edge_right)
    if ar_depth_m and depth_source in SENSOR_SOURCES:
        distance, distance_source = ar_depth_m, depth_source
    elif plate_distance:
        distance, distance_source = plate_distance, "qr"
    elif ar_depth_m:
        distance, distance_source = ar_depth_m, "typed"
    elif ai_distance:
        distance, distance_source = ai_distance, "ai"
    else:
        distance, distance_source = None, None
    dbh = _resolve_dbh(views, distance, focal_px, focal_35mm, circumference_cm, caliper_dbh_cm)
    if distance_source in SENSOR_SOURCES:
        dbh.notes.insert(0, "depth_sensor")
    elif distance_source == "qr":
        dbh.notes.insert(0, "depth_qr_plate")
    elif plate is not None and plate_distance is None:
        dbh.notes.append("qr_plate_unreadable")
    if plate_note:
        dbh.notes.append(plate_note)
    if any(v.get("edges") for v in views):
        dbh.notes.append("edges_operator")
    if distance_source == "ai":
        dbh.notes.insert(0, "depth_ai_estimated")
        if dbh.method not in REFERENCE_METHODS and dbh.confidence is not None:
            dbh.confidence = round(dbh.confidence * AI_DISTANCE_CONFIDENCE, 3)
    if any(v.get("ai_mask") is not None for v in views):
        dbh.notes.append("ai_segmentation")
    if species_name is None and species_candidates:
        dbh.notes.append("species_low_confidence")
    dbh_cm, dbh_method, dbh_conf = dbh.dbh_cm, dbh.method, dbh.confidence
    media_key = _save_labelled_media(views, dbh)

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
    agb_kg, carbon_kg, co2e_kg = living_carbon(dbh_cm, species_name, height)

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
    if linked_code and to_inventory and user is not None:
        if await _inventory_tree(
            linked_code, user, species_name, dbh_cm, latitude, longitude, scan_project
        ):
            dbh.notes.append("tree_inventoried")
        else:
            linked_code = None
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
                tree_code, depth_source, media_key, forest_checks,
                image_urls, view_meta, project_id
            ) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb, $23, $24, $25, $26, $27, $28, $29, $30::jsonb, $31::jsonb, $32::jsonb, $33)
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
            distance,
            focal_px,
            user["id"] if user else None,
            dbh.vision_dbh_cm,
            dbh.uncertainty_cm,
            json.dumps(dbh.notes),
            height_method,
            agb_kg,
            carbon_kg,
            co2e_kg,
            linked_code,
            distance_source,
            media_key,
            json.dumps(forest_checks) if forest_checks else None,
            json.dumps(image_urls),
            json.dumps(view_meta),
            scan_project,
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
        distance_m=distance,
        distance_source=distance_source,
        tree_code=linked_code,
        species_candidates=species_candidates,
        species_flora=species_flora,
        forest_checks=forest_checks,
        project_id=scan_project,
        project_title=project_title,
        project_note=project_note,
    )


@router.get("/capabilities")
async def capabilities():
    """What the scanner can do server-side (lets the app offer auto modes)."""
    return {**ai_models.capabilities(), "max_image_bytes": get_settings().max_image_bytes}


@router.post("/report/pdf")
async def report_pdf(report: V1Report = Body(...)):
    """Render a previously computed V1 report as a branded PDF."""
    pdf = pdf_report.render_measurement_pdf(report.model_dump())
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="rapport_forestier.pdf"'},
    )


@router.post("/identify-plant")
async def identify_plant(
    images: list[UploadFile] = File(..., description="1 à 5 photos de la plante"),
    organs: list[str] | None = Form(
        None, description="Organe de chaque photo: leaf/flower/fruit/bark/whole"
    ),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    user: dict | None = Depends(get_optional_user),
):
    """Plant recognition only: Pl@ntNet re-ranked for Gabon; nothing is stored."""
    if user is None:
        raise HTTPException(status_code=401, detail="Connexion requise")
    if not images or len(images) > _PLANTNET_MAX_IMAGES:
        raise HTTPException(status_code=422, detail="Entre 1 et 5 photos")
    limit = get_settings().max_image_bytes
    views = []
    for i, upload in enumerate(images):
        data = await _read_capped(upload, limit)
        gray = cv2.cvtColor(_decode(data), cv2.COLOR_BGR2GRAY)
        organ = _norm_organ(organs[i]) if organs and i < len(organs) else "auto"
        views.append(
            {
                "bytes": data,
                "organ": "leaf" if organ == "dbh" else organ,
                "sharpness": float(cv2.Laplacian(gray, cv2.CV_64F).var()),
            }
        )
    lat = latitude if latitude is not None else 0.0
    lon = longitude if longitude is not None else 11.6
    name, score, ranked, project = await _identify_species(views, lat, lon)
    if not ranked and not get_settings().plantnet_api_key:
        raise HTTPException(status_code=503, detail="Reconnaissance des plantes indisponible")
    return {"scientific_name": name, "score": score, "candidates": ranked, "flora": project}


class ClientLog(BaseModel):
    kind: str = Field(..., max_length=40)
    message: str = Field(..., max_length=2000)
    stack: str | None = Field(None, max_length=4000)
    app_version: str | None = Field(None, max_length=40)
    platform: str | None = Field(None, max_length=20)
    timings_ms: dict[str, int] | None = None


@router.post("/client-log", status_code=204)
async def client_log(entry: ClientLog, user: dict | None = Depends(get_optional_user)):
    """App-side errors and slow starts, written to the API log for diagnosis (nothing stored)."""
    logger.warning(
        "client-log %s",
        json.dumps(
            {**entry.model_dump(), "user_id": user["id"] if user else None},
            ensure_ascii=False,
        ),
    )
    return Response(status_code=204)
