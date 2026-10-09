import Constants from "expo-constants";

const configured =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined);

/**
 * Optional API key for gateway auth (Track D). Inlined from the environment at
 * build/dev time; set EXPO_PUBLIC_API_KEY (see mobile/.env.example). When
 * absent the app talks to an open gateway (local/dev mode).
 */
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

/** Bearer token set after login (see setAuthToken); module-scoped like API_KEY. */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (API_KEY) h["X-API-Key"] = API_KEY;
  if (authToken) h["Authorization"] = `Bearer ${authToken}`;
  return h;
}

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
  rag_sources?: string[] | null;
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
  references?: string[] | null;
}

export interface MatchedCooperative {
  id: string;
  name: string;
  profile_type: string;
  distance_km: number;
  is_certified: boolean;
  latitude: number | null;
  longitude: number | null;
  relevant_mass_kg?: number;
  match_score?: number;
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
    headers: headers(),
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
    headers: headers(true),
    body: JSON.stringify(params),
  });
  if (!resp.ok) throw new Error(`V2 ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export type Role = "operator" | "company" | "cooperative" | "admin";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: Role;
  display_name: string;
}

export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  cooperative_id: number | null;
  company_id: number | null;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const resp = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(`Login ${resp.status}`);
  return resp.json();
}

export async function getMe(): Promise<AuthUser> {
  const resp = await fetch(`${API_BASE}/api/auth/me`, { headers: headers() });
  if (!resp.ok) throw new Error(`Me ${resp.status}`);
  return resp.json();
}

export interface Cooperation {
  id: number;
  cooperative_name: string;
  profile_type: string;
  capacity_kg_per_day: number | null;
  is_certified: boolean;
  latitude: number | null;
  longitude: number | null;
  relevant_mass_kg?: number;
  match_score?: number;
}

export async function listCooperatives(residueId?: number): Promise<Cooperation[]> {
  const suffix = residueId != null ? `?residue_id=${residueId}` : "";
  const resp = await fetch(`${API_BASE}/api/company/cooperatives${suffix}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Cooperatives ${resp.status}`);
  return resp.json();
}

export interface CompanyResidue {
  id: number;
  species_scientific_name: string | null;
  measured_dbh_cm: number | null;
  estimated_height_m: number | null;
  residue_biomass_kg: number | null;
  status: "available" | "allocated" | "collected";
  assigned_community_cooperative_id: number | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export async function companyResidues(): Promise<CompanyResidue[]> {
  const resp = await fetch(`${API_BASE}/api/company/residues`, { headers: headers() });
  if (!resp.ok) throw new Error(`Company residues ${resp.status}`);
  return resp.json();
}

export async function allocateResidue(
  residueId: number,
  cooperativeId: number,
): Promise<{ id: number; status: string }> {
  const resp = await fetch(`${API_BASE}/api/company/residues/${residueId}/allocate`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ cooperative_id: cooperativeId }),
  });
  if (!resp.ok) throw new Error(`Allocate ${resp.status}`);
  return resp.json();
}

export async function releaseResidue(
  residueId: number,
): Promise<{ id: number; status: string }> {
  const resp = await fetch(`${API_BASE}/api/company/residues/${residueId}/release`, {
    method: "POST",
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Release ${resp.status}`);
  return resp.json();
}

export interface NearbyResidue extends CompanyResidue {
  relevant_mass_kg: number;
  match_score: number;
  distance_km: number;
  assigned_to_me: boolean;
}

export interface NearbyResiduesResponse {
  profile_type: string | null;
  count: number;
  residues: NearbyResidue[];
}

export async function cooperativeResidues(
  latitude: number,
  longitude: number,
  options: { radiusKm?: number; onlyMatching?: boolean } = {},
): Promise<NearbyResiduesResponse> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  });
  if (options.radiusKm != null) params.set("radius_km", String(options.radiusKm));
  if (options.onlyMatching) params.set("only_matching", "true");
  const resp = await fetch(`${API_BASE}/api/cooperative/residues?${params.toString()}`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Cooperative residues ${resp.status}`);
  return resp.json();
}

export async function collectResidue(residueId: number): Promise<{ id: number; status: string }> {
  const resp = await fetch(`${API_BASE}/api/cooperative/residues/${residueId}/collect`, {
    method: "POST",
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Collect ${resp.status}`);
  return resp.json();
}

export interface AdminStats {
  users: number;
  cooperatives: number;
  scans: number;
  residues: number;
  residues_available: number;
  residues_allocated: number;
  residues_collected: number;
  waste_kg: number;
}

export async function adminStats(): Promise<AdminStats> {
  const resp = await fetch(`${API_BASE}/api/admin/stats`, { headers: headers() });
  if (!resp.ok) throw new Error(`Admin stats ${resp.status}`);
  return resp.json();
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  cooperative_id: number | null;
  company_id: number | null;
  created_at?: string;
}

export async function listUsers(): Promise<AdminUser[]> {
  const resp = await fetch(`${API_BASE}/api/admin/users`, { headers: headers() });
  if (!resp.ok) throw new Error(`Admin users ${resp.status}`);
  return resp.json();
}

export interface CreateUserPayload {
  email: string;
  display_name: string;
  password: string;
  role: Role;
  cooperative_id?: number | null;
  company_id?: number | null;
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const resp = await fetch(`${API_BASE}/api/admin/users`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Create user ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function adminCooperatives(): Promise<Cooperation[]> {
  const resp = await fetch(`${API_BASE}/api/admin/cooperatives`, { headers: headers() });
  if (!resp.ok) throw new Error(`Admin cooperatives ${resp.status}`);
  return resp.json();
}

export async function setUserActive(userId: number, isActive: boolean): Promise<AdminUser> {
  const resp = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!resp.ok) throw new Error(`Update user ${resp.status}: ${await resp.text()}`);
  return resp.json();
}
