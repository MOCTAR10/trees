import Constants from "expo-constants";

const configured = Constants.expoConfig?.extra?.apiUrl as string | undefined;

/**
 * Optional API key for gateway auth (Track D). Inlined from the environment at
 * build/dev time; set EXPO_PUBLIC_API_KEY (see mobile/.env.example). When
 * absent the app talks to an open gateway (local/dev mode).
 */
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

const authHeaders = API_KEY ? { "X-API-Key": API_KEY } : undefined;

/**
 * API base URL (Node gateway). Defaults to localhost for the Expo web/simulator
 * case; on a physical device, set `extra.apiUrl` in app.json to the machine's
 * LAN IP (e.g. http://192.168.1.10:3000).
 */
export const API_BASE = configured ?? "http://localhost:3000";

export interface V1Report {
  species_scientific_name: string | null;
  species_common_name_fr: string | null;
  species_confidence: number | null;
  measured_dbh_cm: number | null;
  dbh_method: string | null;
  dbh_confidence: number | null;
  estimated_height_m: number | null;
  estimated_age_years: number | null;
  age_model_used: string | null;
  health_status: string | null;
  soil_type: string | null;
  canopy_density_fcd: number | null;
  narrative_fr: string | null;
}

export interface ResidueChannel {
  mass_kg?: number;
  volume_m3?: number;
  primary_recommendation?: string;
  technical_protocol_summary?: string;
  industrial_use_case?: string;
  artisan_or_pharmaceutical_value?: string;
}

export interface ValorizationPlan {
  analysis_summary: {
    species: string;
    dbh_cm: number;
    height_m?: number;
    total_waste_biomass_kg: number;
  };
  residue_breakdown: {
    canopy_and_branches: ResidueChannel;
    bark_and_organic_liquids: ResidueChannel;
    stump_and_roots: ResidueChannel;
  };
  win_win_synergy_plan: {
    logging_company_csr_benefits: {
      fsc_criteria_met: string;
      gabon_law_016_compliance: string;
      fire_hazard_reduction_index: string;
    };
    community_impact_plan: {
      target_cooperative_id: number | null;
      target_cooperative_name: string | null;
      profile_type: string | null;
      logistical_distance_km: number | null;
      target_cooperative_latitude: number | null;
      target_cooperative_longitude: number | null;
      local_economic_value_creation_estimate: string;
    };
  };
  carbon_offset_metadata: {
    avoided_methane_emissions_co2eq_kg: number;
  };
}

export interface MatchedCooperative {
  id: string;
  name: string;
  profile_type: string;
  distance_km: number;
  is_certified: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface V2Response {
  valorization_plan: ValorizationPlan;
  matched_cooperatives: MatchedCooperative[];
}

export interface CapturedImage {
  uri: string;
  name: string;
  type: string;
}

export async function processScanV1(params: {
  trunk: CapturedImage;
  leaf: CapturedImage;
  habitat: CapturedImage;
  latitude: number;
  longitude: number;
  arDepthM: number;
  focalPx?: number;
}): Promise<V1Report> {
  const form = new FormData();
  form.append("trunk_image", params.trunk as unknown as Blob);
  form.append("leaf_image", params.leaf as unknown as Blob);
  form.append("habitat_image", params.habitat as unknown as Blob);
  form.append("latitude", String(params.latitude));
  form.append("longitude", String(params.longitude));
  form.append("ar_depth_m", String(params.arDepthM));
  if (params.focalPx) form.append("focal_px", String(params.focalPx));

  const resp = await fetch(`${API_BASE}/api/v1/process-scan`, {
    method: "POST",
    body: form,
    headers: authHeaders,
  });
  if (!resp.ok) throw new Error(`V1 ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function processScanV2(params: {
  species_scientific_name: string;
  measured_dbh_cm: number;
  latitude: number;
  longitude: number;
  canopy_density_fcd?: number;
}): Promise<V2Response> {
  const resp = await fetch(`${API_BASE}/api/v2/process-scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(params),
  });
  if (!resp.ok) throw new Error(`V2 ${resp.status}: ${await resp.text()}`);
  return resp.json();
}
