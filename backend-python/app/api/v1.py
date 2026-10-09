"""Phase 1 endpoint: full measurement pipeline -> structured forestry report."""

import cv2
import numpy as np
from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.core.chapman_richards import estimate_age_for_species
from app.core.growth_models import estimate_age_by_integration
from app.core.height_diameter import estimate_height_m
from app.core.species_data import resolve_species
from app.models.schemas import V1Report
from app.services import db, gbif, gee, groq_llm, pdf_report, plantnet, rag, soilgrids
from app.services.vision import measure_dbh

router = APIRouter()


def _decode(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Image décodable requise")
    return image


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


@router.post("/process-scan", response_model=V1Report)
async def process_scan(
    trunk_image: UploadFile = File(..., description="Vue 1 : écorce / tronc"),
    leaf_image: UploadFile = File(..., description="Vue 2 : feuilles"),
    habitat_image: UploadFile = File(..., description="Vue 3 : contexte habitat"),
    latitude: float = Form(...),
    longitude: float = Form(...),
    ar_depth_m: float | None = Form(None, description="Distance tronc- téléphone à 1,30 m"),
    focal_px: float | None = Form(None, description="Focale caméra en pixels"),
):
    trunk_bytes = await trunk_image.read()
    leaf_bytes = await leaf_image.read()
    trunk_img = _decode(trunk_bytes)
    _decode(leaf_bytes)  # validate the leaf view is a decodable image

    # --- STEP 2: species identification (Pl@ntNet multi-organ fusion) ---
    species_name = None
    species_score = None
    try:
        pn = await plantnet.identify(
            images=[trunk_bytes, leaf_bytes],
            organs=["bark", "leaf"],
            lang="fr",
        )
        species_name = pn.scientific_name
        species_score = pn.score
    except Exception:
        pass  # identification is best-effort; report still returns measurement

    # --- GBIF geographic ecosystem cross-check ---
    if species_name:
        try:
            check = await gbif.validate_species_for_location(species_name, latitude, longitude)
            if not check["valid"] and (species_score or 0) < 0.5:
                species_name = None  # low confidence + no local occurrences
        except Exception:
            pass

    # --- STEP 3: DBH via YOLO+OpenCV hybrid ---
    dbh_cm, dbh_method, dbh_conf = None, "mock", None
    if ar_depth_m and focal_px:
        try:
            measurement = measure_dbh(trunk_img, depth_m=ar_depth_m, focal_px=focal_px)
            dbh_cm = measurement.dbh_cm
            dbh_method = measurement.method
            dbh_conf = measurement.confidence
        except RuntimeError:
            pass

    # --- STEP 4: geospatial context ---
    soil = None
    try:
        soil_data = await soilgrids.fetch_soil(latitude, longitude)
        soil = soil_data["soil_class"] if soil_data else None
    except Exception:
        pass

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

    # --- Health heuristic ---
    health = _bark_health(trunk_img)

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
    except Exception:
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
    except Exception:
        pass

    # --- Persist ---
    try:
        await db.execute(
            """
            INSERT INTO tree_scans (
                species_scientific_name, species_confidence,
                geom, measured_dbh_cm, dbh_method, dbh_confidence,
                estimated_height_m, estimated_age_years, age_model_used,
                soil_type, canopy_density_fcd, image_trunk_url, image_leaf_url,
                image_habitat_url, ar_depth_m, camera_focal_px
            ) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
            "stored://trunk",
            "stored://leaf",
            "stored://habitat",
            ar_depth_m,
            focal_px,
        )
    except Exception:
        pass  # report is still returned when persistence is unavailable

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
