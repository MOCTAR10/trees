from pydantic import BaseModel, Field


class ScanCapture(BaseModel):
    """Payload produced by the mobile 3-view capture."""

    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    ar_depth_m: float | None = Field(
        None, gt=0, description="Phone-to-trunk distance at 1.30 m height"
    )
    focal_px: float | None = Field(None, gt=0, description="Camera focal length in pixels")
    species_hint: str | None = None


class V1Report(BaseModel):
    """Structured forestry report (Phase 1, Step 6)."""

    species_scientific_name: str | None
    species_common_name_fr: str | None
    species_confidence: float | None
    measured_dbh_cm: float | None
    dbh_method: str
    dbh_confidence: float | None
    estimated_height_m: float | None
    estimated_age_years: float | None
    age_model_used: str | None
    health_status: str | None
    soil_type: str | None
    canopy_density_fcd: float | None
    narrative_fr: str | None = Field(None, description="Récit historique et climatique (français)")
    rag_sources: list[str] | None = Field(
        None, description="Sources du corpus Phase 1 (RAG) ayant appuyé le récit"
    )


class ResidueChannel(BaseModel):
    mass_kg: float | None = None
    volume_m3: float | None = None
    primary_recommendation: str = ""
    technical_protocol_summary: str = ""
    industrial_use_case: str | None = None
    artisan_or_pharmaceutical_value: str | None = None


class ResidueBreakdownPlan(BaseModel):
    canopy_and_branches: ResidueChannel
    bark_and_organic_liquids: ResidueChannel
    stump_and_roots: ResidueChannel


class LoggingCompanyCSR(BaseModel):
    fsc_criteria_met: str = ""
    gabon_law_016_compliance: str = ""
    fire_hazard_reduction_index: str = ""


class CommunityImpactPlan(BaseModel):
    target_cooperative_id: int | None = None
    target_cooperative_name: str | None = None
    profile_type: str | None = None
    logistical_distance_km: float | None = None
    target_cooperative_latitude: float | None = None
    target_cooperative_longitude: float | None = None
    local_economic_value_creation_estimate: str = ""


class WinWinSynergyPlan(BaseModel):
    logging_company_csr_benefits: LoggingCompanyCSR
    community_impact_plan: CommunityImpactPlan


class CarbonOffsetMetadata(BaseModel):
    avoided_methane_emissions_co2eq_kg: float


class AnalysisSummary(BaseModel):
    species: str
    dbh_cm: float
    height_m: float
    total_waste_biomass_kg: float


class ValorizationPlan(BaseModel):
    """Strict JSON schema (Phase 2, section 4)."""

    analysis_summary: AnalysisSummary
    residue_breakdown: ResidueBreakdownPlan
    win_win_synergy_plan: WinWinSynergyPlan
    carbon_offset_metadata: CarbonOffsetMetadata
    references: list[str] | None = Field(
        None, description="Sources du corpus Phase 2 (RAG) ayant appuyé le plan"
    )
