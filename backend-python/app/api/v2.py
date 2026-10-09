"""Phase 2 endpoint: circular-economy valorization plan (strict JSON)."""

import logging

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.chave_allometry import AllometryStrategy
from app.models.schemas import ValorizationPlan
from app.services import db, groq_llm, pdf_report, rag
from app.services.biomass_engine import compute_residues

router = APIRouter()
app_logger = logging.getLogger(__name__)

RADIUS_KM = 15.0

# Residue channel -> cooperative profile affinity
PROFILE_AFFINITY = {
    "canopy_and_branches": ["agricultural_biochar", "energy_briquettes"],
    "bark_and_organic_liquids": ["bio_chemical_extraction"],
    "stump_and_roots": ["artisan_furniture", "bio_chemical_extraction"],
}


class V2ScanRequest(BaseModel):
    species_scientific_name: str = Field(..., examples=["Aucoumea klaineana"])
    measured_dbh_cm: float = Field(..., gt=0, le=400, examples=[62.5])
    latitude: float = Field(..., ge=-90, le=90, examples=[0.4162])
    longitude: float = Field(..., ge=-180, le=180, examples=[9.4541])
    canopy_density_fcd: float | None = Field(None, ge=0, le=1)


def _carbon_avoided_kg(biomass: float) -> float:
    """Avoided methane from open-air decomposition of diverted residues.

    IPCC-style estimate: diverted wet biomass decomposing anaerobically
    would emit ~0.05 kg CH4 per kg dry biomass over 5 years (project
    default), converted at GWP100 = 28.
    """
    return round(biomass * 0.05 * 28.0, 1)


@router.post("/process-scan")
async def process_scan_v2(request: V2ScanRequest):
    # --- Step 2.2: biophysical biomass engine ---
    strategy = AllometryStrategy.CHAVE_2014_H
    residues = compute_residues(
        dbh_cm=request.measured_dbh_cm,
        species=request.species_scientific_name,
        strategy=strategy,
    )

    # --- PostGIS: cooperatives within 15 km ---
    cooperatives = await db.find_cooperatives_near(
        request.latitude, request.longitude, radius_km=RADIUS_KM, certified_only=False
    )
    if not cooperatives:
        cooperatives = await db.find_cooperatives_near(
            request.latitude, request.longitude, radius_km=RADIUS_KM * 3, certified_only=False
        )
    best_coop = cooperatives[0] if cooperatives else None

    # --- RAG: per-residue technical/legal context (Phase 2 filters) ---
    rag_context: dict[str, list[str]] = {}
    residue_queries = {
        "canopy_and_branches": (
            "branches fines ramilles biochar briquelettes pyrolyse TLUD protocole",
            "branches",
        ),
        "bark_and_organic_liquids": (
            "écorce extraction tanins colle bio sans formaldéhyde protocole",
            "bark",
        ),
        "stump_and_roots": (
            "souche racines séchage mobilier artisanal sculpture valeur pharmaceutique",
            "roots",
        ),
    }
    for channel, (query, residue_type) in residue_queries.items():
        try:
            chunks = await rag.query_circular_economy(
                query=query,
                top_k=3,
                residue_type=residue_type,
                species=request.species_scientific_name,
            )
            rag_context[channel] = [c.content for c in chunks]
        except Exception:
            rag_context[channel] = []

    # --- Agentic LLM: strict-schema Endogenous Action Plan (French values) ---
    coop_line = (
        f"{best_coop['cooperative_name']} (id={best_coop['id']}, type={best_coop['profile_type']}, "
        f"distance={best_coop['distance_km']:.1f} km, certifiée={best_coop['is_certified']})"
        if best_coop
        else "aucune coopérative dans le rayon élargi"
    )
    system_prompt = (
        "Tu es un expert en économie circulaire forestière au Gabon. "
        "Réponds UNIQUEMENT avec un objet JSON valide respectant exactement le schéma demandé. "
        "Toutes les valeurs textuelles en français. N'invente pas de chiffres hors des données fournies."
    )
    user_prompt = f"""Données biomasse (moteur allométrique Chave 2014, espèce {residues.species}):
- DBH: {residues.dbh_cm} cm, Hauteur: {residues.height_m:.1f} m, AGB: {residues.total_agb_kg:.0f} kg, BGB: {residues.total_bgb_kg:.0f} kg
- Branches fines (<10cm): {residues.weight_branches_fine_kg:.0f} kg | Branches épaisses (>15cm): {residues.weight_branches_thick_kg:.0f} kg
- Écorce: {residues.weight_bark_kg:.0f} kg | Feuilles: {residues.weight_foliar_kg:.0f} kg
- Souche: {residues.volume_stump_m3:.2f} m3 ({residues.weight_stump_kg:.0f} kg) | Racines: {residues.weight_roots_kg:.0f} kg
- Sciure (kerf 5mm): {residues.volume_sawdust_m3:.3f} m3
- Biomasse résiduelle totale: {residues.total_waste_biomass_kg:.0f} kg

Coopérative la plus proche (<{RADIUS_KM} km): {coop_line}

Contexte RAG protocoles/legislation par voie de valorisation:
BRANCHES: {rag_context["canopy_and_branches"]}
ÉCORCE: {rag_context["bark_and_organic_liquids"]}
SOUCHE/RACINES: {rag_context["stump_and_roots"]}

Cadre légal: Code forestier gabonais Loi 016/01 (Art. 21, 22, 251 — faible impact EFIR, transformation locale, communautés), FSC Principes 3 et 4, PEFC/PAFC, Article 6 de l'Accord de Paris.

Schéma JSON exact:
{{
  "analysis_summary": {{"species": string, "dbh_cm": number, "height_m": number, "total_waste_biomass_kg": number}},
  "residue_breakdown": {{
    "canopy_and_branches": {{"mass_kg": number, "primary_recommendation": string, "technical_protocol_summary": string}},
    "bark_and_organic_liquids": {{"mass_kg": number, "primary_recommendation": string, "industrial_use_case": string}},
    "stump_and_roots": {{"volume_m3": number, "artisan_or_pharmaceutical_value": string}}
  }},
  "win_win_synergy_plan": {{
    "logging_company_csr_benefits": {{"fsc_criteria_met": string, "gabon_law_016_compliance": string, "fire_hazard_reduction_index": string}},
    "community_impact_plan": {{"target_cooperative_id": number|null, "target_cooperative_name": string, "profile_type": string, "logistical_distance_km": number|null, "local_economic_value_creation_estimate": string}}
  }},
  "carbon_offset_metadata": {{"avoided_methane_emissions_co2eq_kg": number}}
}}"""

    try:
        plan_json = await groq_llm.chat_json(system_prompt, user_prompt)
        # Enforce/repair numeric invariants from the deterministic engine
        plan_json.setdefault("analysis_summary", {})
        plan_json["analysis_summary"]["species"] = residues.species
        plan_json["analysis_summary"]["dbh_cm"] = residues.dbh_cm
        plan_json["analysis_summary"]["height_m"] = round(residues.height_m, 2)
        plan_json["analysis_summary"]["total_waste_biomass_kg"] = round(
            residues.total_waste_biomass_kg, 1
        )
        plan_json.setdefault("carbon_offset_metadata", {})
        plan_json["carbon_offset_metadata"]["avoided_methane_emissions_co2eq_kg"] = (
            _carbon_avoided_kg(residues.total_waste_biomass_kg)
        )
        rb = plan_json.setdefault("residue_breakdown", {})
        canopy = rb.setdefault("canopy_and_branches", {})
        canopy["mass_kg"] = round(
            residues.weight_branches_fine_kg + residues.weight_branches_thick_kg, 1
        )
        bark = rb.setdefault("bark_and_organic_liquids", {})
        bark["mass_kg"] = round(residues.weight_bark_kg, 1)
        stump = rb.setdefault("stump_and_roots", {})
        stump["volume_m3"] = round(residues.volume_stump_m3, 3)
        if best_coop:
            impact = plan_json.setdefault("win_win_synergy_plan", {}).setdefault(
                "community_impact_plan", {}
            )
            impact["target_cooperative_id"] = best_coop["id"]
            impact["target_cooperative_name"] = best_coop["cooperative_name"]
            impact["profile_type"] = best_coop["profile_type"]
            impact["logistical_distance_km"] = round(best_coop["distance_km"], 2)
            impact["target_cooperative_latitude"] = best_coop.get("latitude")
            impact["target_cooperative_longitude"] = best_coop.get("longitude")
        plan = ValorizationPlan.model_validate(plan_json)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Génération du plan échouée: {exc}. Vérifiez GROQ_API_KEY / modèle.",
        ) from exc

    # --- Persist ---
    try:
        await db.execute(
            """
            INSERT INTO tree_scans_and_residues (
                geom, species_scientific_name, measured_dbh_cm, estimated_height_m,
                total_agb_kg, total_bgb_kg,
                volume_branches_m3,
                weight_branches_fine_kg, weight_branches_thick_kg,
                weight_bark_kg, weight_foliar_kg,
                volume_stump_m3, weight_roots_kg, volume_sawdust_m3,
                assigned_community_cooperative_id, valorization_plan
            ) VALUES (
                ST_SetSRID(ST_MakePoint($2, $1), 4326), $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17
            )
            """,
            request.latitude,
            request.longitude,
            residues.species,
            residues.dbh_cm,
            round(residues.height_m, 2),
            residues.total_agb_kg,
            residues.total_bgb_kg,
            residues.volume_branches_m3,
            residues.weight_branches_fine_kg,
            residues.weight_branches_thick_kg,
            residues.weight_bark_kg,
            residues.weight_foliar_kg,
            residues.volume_stump_m3,
            residues.weight_roots_kg,
            residues.volume_sawdust_m3,
            best_coop["id"] if best_coop else None,
            plan.model_dump_json(),
        )
    except Exception as exc:
        app_logger.warning("v2 persistence failed (scan still returned): %s", exc)

    return {
        "residue_engine": residues.to_dict(),
        "valorization_plan": plan.model_dump(),
        "matched_cooperatives": [
            {
                "id": c["id"],
                "name": c["cooperative_name"],
                "profile_type": c["profile_type"],
                "distance_km": round(c["distance_km"], 2),
                "is_certified": c["is_certified"],
                "latitude": c.get("latitude"),
                "longitude": c.get("longitude"),
            }
            for c in cooperatives[:5]
        ],
    }


@router.post("/report/pdf")
async def report_pdf_v2(payload: dict = Body(...)):
    """Render a previously computed V2 valorization response as a branded PDF."""
    pdf = pdf_report.render_valorization_pdf(payload)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="plan_valorisation.pdf"'},
    )
