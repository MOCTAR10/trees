import Constants from "expo-constants";
import { File } from "expo-file-system";

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

/**
 * Fired when an authenticated request is rejected with 401 (expired/revoked
 * token). Registered by the app shell so it can drop the session and return to
 * login instead of silently serving stale cached data.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (API_KEY) h["X-API-Key"] = API_KEY;
  if (authToken) h["Authorization"] = `Bearer ${authToken}`;
  return h;
}

export const API_TIMEOUT_MS = 25000;
export const UPLOAD_TIMEOUT_MS = 150000;
export const PING_TIMEOUT_MS = 5000;

let gatewayReachable: boolean | null = null;

export function isGatewayReachable(): boolean | null {
  return gatewayReachable;
}

export function setGatewayReachable(value: boolean | null): void {
  gatewayReachable = value;
}

/** Fast liveness probe (gateway /health needs no auth key). Never throws. */
export async function pingGateway(timeoutMs: number = PING_TIMEOUT_MS): Promise<boolean> {
  try {
    const resp = await timedFetch(`${API_BASE}/health`, {}, timeoutMs);
    gatewayReachable = resp.ok;
    return resp.ok;
  } catch {
    gatewayReachable = false;
    return false;
  }
}

/**
 * fetch with a hard timeout. The gateway URL is often a LAN IP that can
 * silently black-hole off-network — without this every screen hangs
 * forever instead of failing fast into its offline/error path.
 */
export async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timeoutError = () => new Error(`Délai dépassé (${Math.round(timeoutMs / 1000)}s) : ${url}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        ctrl.abort();
      } catch {
        // ignore abort failures and still fail fast below
      }
      reject(timeoutError());
    }, timeoutMs);
  });
  const request = fetch(url, { ...init, signal: ctrl.signal });
  request.catch(() => undefined);
  try {
    const response = await Promise.race([request, timeout]);
    // A 401 with a bearer token attached means the session is no longer valid
    // (expired/revoked) — let the app react instead of failing silently.
    if (response.status === 401 && authToken) unauthorizedHandler?.();
    return response;
  } catch (err) {
    if (ctrl.signal.aborted) {
      throw timeoutError();
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
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

export type Organ = "bark" | "leaf" | "flower" | "fruit" | "whole";

export interface CaptureShot {
  image: CapturedImage;
  organ: Organ;
  /** Orbit azimuth in degrees (0/90/180/270); omitted for organ close-ups. */
  azimuth?: number;
}

const ORGAN_WIRE: Record<Organ, string> = {
  bark: "bark",
  leaf: "leaf",
  flower: "flower",
  fruit: "fruit",
  whole: "whole",
};

export async function processScanV1(params: {
  shots: CaptureShot[];
  latitude: number;
  longitude: number;
  arDepthM: number;
  focalPx?: number;
}): Promise<V1Report> {
  const form = new FormData();
  params.shots.forEach((shot) => {
    // Expo SDK 54+ installs its WinterCG fetch as the global `fetch`, and its
    // FormData encoder rejects React Native's {uri,name,type} parts with
    // "Unsupported FormDataPart implementation". expo-file-system's File
    // implements Blob (bytes()), which the WinterCG encoder does support.
    form.append("images", new File(shot.image.uri) as unknown as Blob);
    form.append("organs", ORGAN_WIRE[shot.organ]);
    form.append("azimuths", String(shot.azimuth ?? -1));
  });
  form.append("latitude", String(params.latitude));
  form.append("longitude", String(params.longitude));
  form.append("ar_depth_m", String(params.arDepthM));
  if (params.focalPx) form.append("focal_px", String(params.focalPx));

  const resp = await timedFetch(
    `${API_BASE}/api/v1/process-scan`,
    {
      method: "POST",
      body: form,
      headers: headers(),
    },
    UPLOAD_TIMEOUT_MS,
  );
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
  const resp = await timedFetch(`${API_BASE}/api/v2/process-scan`, {
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
  organization_id?: number | null;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const resp = await timedFetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(`Login ${resp.status}`);
  return resp.json();
}

export interface EmailCheckResponse {
  role: Role;
  display_name: string;
  organization: string | null;
  organization_type: "company" | "cooperative" | null;
}

export async function checkEmail(email: string): Promise<EmailCheckResponse> {
  const resp = await timedFetch(`${API_BASE}/api/auth/check-email`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ email }),
  });
  if (!resp.ok) throw new Error(`CheckEmail ${resp.status}`);
  return resp.json();
}

export async function getMe(): Promise<AuthUser> {
  const resp = await timedFetch(`${API_BASE}/api/auth/me`, { headers: headers() });
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
  const resp = await timedFetch(`${API_BASE}/api/company/cooperatives${suffix}`, { headers: headers() });
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
  tree_code?: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export async function companyResidues(): Promise<CompanyResidue[]> {
  const resp = await timedFetch(`${API_BASE}/api/company/residues`, { headers: headers() });
  if (!resp.ok) throw new Error(`Company residues ${resp.status}`);
  return resp.json();
}

export async function allocateResidue(
  residueId: number,
  cooperativeId: number,
): Promise<{ id: number; status: string }> {
  const resp = await timedFetch(`${API_BASE}/api/company/residues/${residueId}/allocate`, {
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
  const resp = await timedFetch(`${API_BASE}/api/company/residues/${residueId}/release`, {
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
  const resp = await timedFetch(`${API_BASE}/api/cooperative/residues?${params.toString()}`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Cooperative residues ${resp.status}`);
  return resp.json();
}

export async function collectResidue(residueId: number): Promise<{ id: number; status: string }> {
  const resp = await timedFetch(`${API_BASE}/api/cooperative/residues/${residueId}/collect`, {
    method: "POST",
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Collect ${resp.status}`);
  return resp.json();
}

export interface OrgProfile {
  organization: string | null;
  organization_type: "company" | "cooperative" | null;
  profile_type?: string | null;
}

/** Company backing the header (own row, or inherited for operators). */
export async function companyProfile(): Promise<OrgProfile> {
  const resp = await timedFetch(`${API_BASE}/api/company/profile`, { headers: headers() });
  if (!resp.ok) throw new Error(`Company profile ${resp.status}`);
  return resp.json();
}

/** Cooperative backing the header. */
export async function cooperativeProfile(): Promise<OrgProfile> {
  const resp = await timedFetch(`${API_BASE}/api/cooperative/profile`, { headers: headers() });
  if (!resp.ok) throw new Error(`Cooperative profile ${resp.status}`);
  return resp.json();
}

export type PermitType = "CFAD" | "PFA" | "PGG" | "ASC" | "ACBSL" | "foret_communautaire";
export type MarkingType = "qr" | "peinture" | "gps_photo";
export type DeclarationStatus = "soumise" | "autorisee" | "rejetee";
export type RegistryStatus =
  | "inventorie"
  | "declare"
  | "autorise"
  | "abattu"
  | "transporte"
  | "transforme";
export type CustodyEventKind = "abattu" | "transporte" | "receptionne" | "transforme";

export interface DeclarationLineInput {
  tree_code: string;
  marking_type: MarkingType;
  species_scientific_name?: string | null;
  measured_dbh_cm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DeclarationInput {
  permit_type: PermitType;
  permit_number: string;
  ufa_label?: string | null;
  aac_label?: string | null;
  campaign_year?: number | null;
  lines: DeclarationLineInput[];
}

export interface CheckedLine {
  tree_code: string;
  dme_cm: number | null;
  violations: string[];
}

export interface DeclarationCreated {
  id: number;
  status: DeclarationStatus;
  lines_checked: CheckedLine[];
}

export interface DeclarationLine extends CheckedLine {
  id: number;
  marking_type: MarkingType;
  species_scientific_name: string | null;
  measured_dbh_cm: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Declaration {
  id: number;
  company_id: number | null;
  permit_type: PermitType;
  permit_number: string;
  ufa_label: string | null;
  aac_label: string | null;
  campaign_year: number | null;
  status: DeclarationStatus;
  decision_motif: string | null;
  line_count?: number;
  created_at: string;
}

export interface RegistryTree {
  id: number;
  tree_code: string;
  marking_type: MarkingType;
  species_scientific_name: string | null;
  measured_dbh_cm: number | null;
  status: RegistryStatus;
  permit_number: string | null;
  aac_label: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface AnomalyLine {
  tree_code: string;
  species_scientific_name: string | null;
  measured_dbh_cm: number | null;
  dme_cm: number | null;
  permit_number?: string | null;
  company_id?: number | null;
  created_at?: string;
  actor_id?: number | null;
}

export async function createDeclaration(input: DeclarationInput): Promise<DeclarationCreated> {
  const resp = await timedFetch(`${API_BASE}/api/felling/declarations`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Declaration ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function listDeclarations(status?: DeclarationStatus): Promise<Declaration[]> {
  const qs = status ? `?status=${status}` : "";
  const resp = await timedFetch(`${API_BASE}/api/felling/declarations${qs}`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Declarations ${resp.status}`);
  return resp.json();
}

export async function getDeclaration(
  id: number,
): Promise<{ declaration: Declaration; lines: DeclarationLine[] }> {
  const resp = await timedFetch(`${API_BASE}/api/felling/declarations/${id}`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Declaration ${resp.status}`);
  return resp.json();
}

export async function decideDeclaration(
  id: number,
  decision: "autorisee" | "rejetee",
  motif?: string | null,
): Promise<{ id: number; status: DeclarationStatus }> {
  const resp = await timedFetch(`${API_BASE}/api/felling/declarations/${id}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ decision, motif: motif ?? null }),
  });
  if (!resp.ok) throw new Error(`Decision ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function recordCustodyEvent(input: {
  tree_code: string;
  event: CustodyEventKind;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
  note?: string | null;
}): Promise<{ id: number; tree_code: string; event: CustodyEventKind }> {
  const resp = await timedFetch(`${API_BASE}/api/felling/events`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Custody ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function listRegistryTrees(status?: RegistryStatus): Promise<RegistryTree[]> {
  const qs = status ? `?status=${status}` : "";
  const resp = await timedFetch(`${API_BASE}/api/felling/trees${qs}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Registry ${resp.status}`);
  return resp.json();
}

export async function listAnomalies(): Promise<{
  below_dme_authorized: AnomalyLine[];
  felled_without_authorization: AnomalyLine[];
}> {
  const resp = await timedFetch(`${API_BASE}/api/felling/anomalies`, { headers: headers() });
  if (!resp.ok) throw new Error(`Anomalies ${resp.status}`);
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
  const resp = await timedFetch(`${API_BASE}/api/admin/stats`, { headers: headers() });
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
  const resp = await timedFetch(`${API_BASE}/api/admin/users`, { headers: headers() });
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
  const resp = await timedFetch(`${API_BASE}/api/admin/users`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Create user ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function adminCooperatives(): Promise<Cooperation[]> {
  const resp = await timedFetch(`${API_BASE}/api/admin/cooperatives`, { headers: headers() });
  if (!resp.ok) throw new Error(`Admin cooperatives ${resp.status}`);
  return resp.json();
}

export async function setUserActive(userId: number, isActive: boolean): Promise<AdminUser> {
  const resp = await timedFetch(`${API_BASE}/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!resp.ok) throw new Error(`Update user ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export interface SpeciesSummary {
  scientific_name: string;
  common_name_fr: string | null;
  family: string | null;
  wood_density_g_cm3: number | null;
  iucn_status: string | null;
  cites_appendix: string | null;
  eu_listing: string | null;
  native_to_africa: boolean | null;
  aliases: string[];
  countries: string[];
  type: string;
}

export interface SpeciesListResponse {
  count: number;
  species: SpeciesSummary[];
}

export async function listSpecies(query?: string): Promise<SpeciesListResponse> {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  const resp = await timedFetch(`${API_BASE}/api/species${qs}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Species ${resp.status}`);
  return resp.json();
}

export interface SpeciesDetail {
  scientific_name: string;
  common_name_fr: string;
  wood_density_g_cm3: number;
  cr_asymptote_a_cm: number;
  cr_rate_k: number;
  cr_shape_p: number;
  hd_a: number;
  hd_b: number;
  iucn_status: string;
  max_height_m: number;
  aliases: string[];
  family: string;
  cr_source: string;
  cites_appendix: string;
  eu_listing: string;
  native_to_africa: boolean | null;
  countries: string[];
}

export async function getSpecies(name: string): Promise<SpeciesDetail> {
  const resp = await timedFetch(`${API_BASE}/api/species/${encodeURIComponent(name)}`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Species detail ${resp.status}`);
  return resp.json();
}

export interface MyTree {
  id: number;
  species_scientific_name: string | null;
  species_confidence: number | null;
  measured_dbh_cm: number | null;
  estimated_height_m: number | null;
  estimated_age_years: number | null;
  health_status: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export async function listMyTrees(limit = 200): Promise<MyTree[]> {
  const resp = await timedFetch(`${API_BASE}/api/my-trees?limit=${limit}`, { headers: headers() });
  if (!resp.ok) throw new Error(`My trees ${resp.status}`);
  return resp.json();
}

export interface GroupTree extends MyTree {
  owner_id: number;
  owner_name: string;
}

export async function listGroupTrees(limit = 500): Promise<GroupTree[]> {
  const resp = await timedFetch(`${API_BASE}/api/group/trees?limit=${limit}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Group trees ${resp.status}`);
  return resp.json();
}

export interface DiagnosticFlagged {
  id: number;
  species_scientific_name: string | null;
  species_confidence: number | null;
  measured_dbh_cm: number | null;
  health_status: string | null;
  created_at: string;
  reasons: string[];
}

export interface DiagnosticsResponse {
  scope: "all" | "own";
  total: number;
  by_health: Record<string, number>;
  anomalies: number;
  unidentified: number;
  low_confidence: number;
  missing_dbh: number;
  flagged: DiagnosticFlagged[];
}

export async function getDiagnostics(): Promise<DiagnosticsResponse> {
  const resp = await timedFetch(`${API_BASE}/api/diagnostics`, { headers: headers() });
  if (!resp.ok) throw new Error(`Diagnostics ${resp.status}`);
  return resp.json();
}

export type ProjectObjective = "cartographie" | "inventaire" | "sante" | "restauration" | "autre";
export type ProjectTargetType = "species" | "family" | "genus" | "all";
export type ProjectStatus = "draft" | "open" | "closed";

export interface Project {
  id: number;
  title: string;
  description: string;
  target_type: ProjectTargetType;
  target_value: string;
  objective: ProjectObjective;
  latitude: number | null;
  longitude: number | null;
  radius_km: number | null;
  status: ProjectStatus;
  created_by: number;
  created_at: string;
  participant_count: number;
  scan_count: number;
}

export interface ProjectContribution {
  id: number;
  species_scientific_name: string | null;
  measured_dbh_cm: number | null;
  health_status: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  owner_name: string;
}

export interface ProjectDetail extends Project {
  species_count: number;
  contributor_count: number;
  is_participant: boolean;
  contributions: ProjectContribution[];
}

export interface CreateProjectPayload {
  title: string;
  description?: string;
  target_type?: ProjectTargetType;
  target_value?: string;
  objective?: ProjectObjective;
  latitude?: number | null;
  longitude?: number | null;
  radius_km?: number | null;
}

export async function listProjects(): Promise<Project[]> {
  const resp = await timedFetch(`${API_BASE}/api/projects`, { headers: headers() });
  if (!resp.ok) throw new Error(`Projects ${resp.status}`);
  return resp.json();
}

export async function getProject(id: number): Promise<ProjectDetail> {
  const resp = await timedFetch(`${API_BASE}/api/projects/${id}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Project ${resp.status}`);
  return resp.json();
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  const resp = await timedFetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Create project ${resp.status}`);
  return resp.json();
}

export async function joinProject(id: number): Promise<{ id: number; joined: boolean }> {
  const resp = await timedFetch(`${API_BASE}/api/projects/${id}/join`, {
    method: "POST",
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Join project ${resp.status}`);
  return resp.json();
}

export async function leaveProject(id: number): Promise<{ id: number; joined: boolean }> {
  const resp = await timedFetch(`${API_BASE}/api/projects/${id}/leave`, {
    method: "POST",
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Leave project ${resp.status}`);
  return resp.json();
}

export async function setProjectStatus(
  id: number,
  status: ProjectStatus,
): Promise<{ id: number; status: string }> {
  const resp = await timedFetch(`${API_BASE}/api/projects/${id}/status`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ status }),
  });
  if (!resp.ok) throw new Error(`Project status ${resp.status}`);
  return resp.json();
}

export async function attributeScan(
  projectId: number,
  scanId: number,
): Promise<{ scan_id: number; project_id: number }> {
  const resp = await timedFetch(`${API_BASE}/api/projects/${projectId}/attribute`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ scan_id: scanId }),
  });
  if (!resp.ok) throw new Error(`Attribute scan ${resp.status}`);
  return resp.json();
}

// ---------------------------------------------------------------------------
// Governance (Loi 016/01): organizations, document vault, titles/UFA/AAC, taxes
// ---------------------------------------------------------------------------

export type OrgType = "entreprise" | "communaute" | "cooperative";

export interface OrgProfileDefinition {
  code: string;
  label: string;
  org_type: OrgType;
  activities: string[];
  allowed_title_types: string[];
  doc_required: { code: string; label: string }[];
  enabled_modules: string[];
  obligations: Record<string, boolean>;
  description: string;
}

export interface Organization {
  id: number;
  org_type: OrgType;
  name: string;
  legal_form: string | null;
  registration_no: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  profile_code: string | null;
  profile_label?: string | null;
  is_active: boolean;
  created_at: string;
}

export type DocStatus = "manquant" | "soumis" | "valide" | "rejete" | "expire";
export type DocScopeType = "company" | "title" | "ufa" | "aac" | "product" | "social";

export interface ChecklistItem {
  doc_type: string;
  label: string;
  status: DocStatus;
}

export interface OrganizationDetail {
  organization: Organization;
  checklist: ChecklistItem[];
}

export interface DocumentType {
  code: string;
  label: string;
  scope_type: DocScopeType;
  authority: string | null;
  validity_months: number | null;
  default_blocking: boolean;
  legal_ref: string | null;
}

export interface LegalDocument {
  id: number;
  scope_type: DocScopeType;
  scope_id: number;
  doc_type: string;
  authority: string | null;
  reference: string | null;
  issued_at: string | null;
  expires_at: string | null;
  status: DocStatus;
  submitted_by?: number | null;
  verified_by?: number | null;
  verified_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface UploadDocumentInput {
  scope_type: DocScopeType;
  scope_id: number;
  doc_type: string;
  reference?: string | null;
  authority?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
  file_url?: string | null;
}

export async function listOrgProfiles(): Promise<OrgProfileDefinition[]> {
  const resp = await timedFetch(`${API_BASE}/api/organizations/profiles`, { headers: headers() });
  if (!resp.ok) throw new Error(`Profiles ${resp.status}`);
  return resp.json();
}

export async function listOrganizations(): Promise<Organization[]> {
  const resp = await timedFetch(`${API_BASE}/api/organizations`, { headers: headers() });
  if (!resp.ok) throw new Error(`Organizations ${resp.status}`);
  return resp.json();
}

/** Own organization + required-document checklist (company/operator). */
export async function myOrganization(): Promise<OrganizationDetail> {
  const resp = await timedFetch(`${API_BASE}/api/organizations/me`, { headers: headers() });
  if (!resp.ok) throw new Error(`Organization ${resp.status}`);
  return resp.json();
}

export async function myDocuments(): Promise<LegalDocument[]> {
  const resp = await timedFetch(`${API_BASE}/api/organizations/me/documents`, { headers: headers() });
  if (!resp.ok) throw new Error(`Documents ${resp.status}`);
  return resp.json();
}

export async function myTitles(): Promise<ForestTitle[]> {
  const resp = await timedFetch(`${API_BASE}/api/organizations/me/titles`, { headers: headers() });
  if (!resp.ok) throw new Error(`Titles ${resp.status}`);
  return resp.json();
}

/** Full document dictionary (code → human label) for both roles. */
export async function listDocumentTypes(): Promise<DocumentType[]> {
  const resp = await timedFetch(`${API_BASE}/api/documents/types`, { headers: headers() });
  if (!resp.ok) throw new Error(`Document types ${resp.status}`);
  return resp.json();
}

export async function uploadDocument(input: UploadDocumentInput): Promise<LegalDocument> {
  const resp = await timedFetch(`${API_BASE}/api/documents/upload`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Upload ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function listDocuments(
  params: { scope_type?: DocScopeType; status?: DocStatus; org_id?: number } = {},
): Promise<LegalDocument[]> {
  const qs = new URLSearchParams();
  if (params.scope_type) qs.set("scope_type", params.scope_type);
  if (params.status) qs.set("status", params.status);
  if (params.org_id != null) qs.set("org_id", String(params.org_id));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const resp = await timedFetch(`${API_BASE}/api/documents${suffix}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Documents ${resp.status}`);
  return resp.json();
}

export async function verifyDocument(
  id: number,
  status: "valide" | "rejete",
  notes?: string | null,
): Promise<LegalDocument> {
  const resp = await timedFetch(`${API_BASE}/api/documents/${id}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ status, notes: notes ?? null }),
  });
  if (!resp.ok) throw new Error(`Verify ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export type TitleType = "CFAD" | "PFA" | "PGG" | "FC";
export type TitleZone = "permanent" | "rural";
export type TitleStatus =
  | "demande"
  | "exploration"
  | "provisoire"
  | "actif"
  | "expire"
  | "retire"
  | "rejete";
export type TitleDecision = "exploration" | "provisoire" | "actif" | "rejete" | "retire";

export interface ForestTitle {
  id: number;
  title_type: TitleType;
  reference: string | null;
  holder_org_id?: number | null;
  zone?: TitleZone;
  surface_ha: number | null;
  status: TitleStatus;
  exploration_start?: string | null;
  exploration_end?: string | null;
  cpaet_start?: string | null;
  cpaet_end?: string | null;
  pa_approved_at?: string | null;
  grant_ref?: string | null;
  grant_date?: string | null;
  decision_motif?: string | null;
  created_at: string;
}

export interface ManagementUnit {
  id: number;
  title_id: number;
  label: string;
  surface_ha: number | null;
  plan_amenagement_ref: string | null;
  pa_approved_at?: string | null;
  pa_expiry?: string | null;
  plan_gestion_ref?: string | null;
  rotation_years?: number | null;
  created_at: string;
}

export type AacStatus = "prepare" | "soumis" | "autorise" | "ouvert" | "ferme";
export type AacOrigin = "plan_amenagement" | "cpaet_provisoire";
export type AacAction = "soumettre_pao" | "autoriser" | "ouvrir" | "fermer" | "rejeter";

export interface AnnualCutBlock {
  id: number;
  ufa_id: number;
  label: string;
  campaign_year: number | null;
  surface_ha: number | null;
  possibility_m3: number | null;
  origin: AacOrigin;
  status: AacStatus;
  pao_reference: string | null;
  pao_submitted_at?: string | null;
}

export async function listTitles(): Promise<ForestTitle[]> {
  const resp = await timedFetch(`${API_BASE}/api/titles`, { headers: headers() });
  if (!resp.ok) throw new Error(`Titles ${resp.status}`);
  return resp.json();
}

export async function requestTitle(input: {
  title_type: TitleType;
  reference?: string | null;
  zone?: TitleZone;
  surface_ha?: number | null;
}): Promise<ForestTitle> {
  const resp = await timedFetch(`${API_BASE}/api/titles`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Title ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function decideTitle(
  id: number,
  decision: TitleDecision,
  motif?: string | null,
): Promise<{ id: number; title_type: TitleType; reference: string | null; status: TitleStatus }> {
  const resp = await timedFetch(`${API_BASE}/api/titles/${id}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ decision, motif: motif ?? null }),
  });
  if (!resp.ok) throw new Error(`Decision ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function listUnits(titleId: number): Promise<ManagementUnit[]> {
  const resp = await timedFetch(`${API_BASE}/api/titles/${titleId}/units`, { headers: headers() });
  if (!resp.ok) throw new Error(`Units ${resp.status}`);
  return resp.json();
}

export async function createUnit(
  titleId: number,
  input: { label: string; surface_ha?: number | null; plan_amenagement_ref?: string | null },
): Promise<ManagementUnit> {
  const resp = await timedFetch(`${API_BASE}/api/titles/${titleId}/units`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Create unit ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function listAacs(ufaId: number): Promise<AnnualCutBlock[]> {
  const resp = await timedFetch(`${API_BASE}/api/titles/units/${ufaId}/aacs`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`AACs ${resp.status}`);
  return resp.json();
}

export async function createAac(
  ufaId: number,
  input: {
    label: string;
    campaign_year?: number | null;
    surface_ha?: number | null;
    possibility_m3?: number | null;
    origin?: AacOrigin;
  },
): Promise<AnnualCutBlock> {
  const resp = await timedFetch(`${API_BASE}/api/titles/units/${ufaId}/aacs`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Create AAC ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function actOnAac(
  aacId: number,
  input: {
    action: AacAction;
    pao_reference?: string | null;
    reference?: string | null;
    valid_to?: string | null;
    motif?: string | null;
  },
): Promise<{ id: number; status: AacStatus }> {
  const resp = await timedFetch(`${API_BASE}/api/titles/aacs/${aacId}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`AAC ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export type AuthorizationType =
  | "certificat_assiette"
  | "permis_annuel_operations"
  | "certificat_vente_coupe"
  | "cae";
export type AuthorizationStatus = "soumis" | "delivre" | "rejete";

export interface AacAuthorization {
  id: number;
  aac_id: number;
  authorization_type: AuthorizationType;
  reference: string | null;
  issued_by?: number | null;
  issued_at?: string | null;
  valid_from: string | null;
  valid_to: string | null;
  startup_notified_at: string | null;
  plan_document_id: number | null;
  status: AuthorizationStatus;
  decision_motif?: string | null;
  created_at: string;
  aac_label?: string | null;
  title_ref?: string | null;
}

export async function listAuthorizations(aacId: number): Promise<AacAuthorization[]> {
  const resp = await timedFetch(`${API_BASE}/api/titles/aacs/${aacId}/authorizations`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Authorizations ${resp.status}`);
  return resp.json();
}

export async function requestAuthorization(
  aacId: number,
  input: {
    authorization_type: AuthorizationType;
    reference?: string | null;
    valid_from?: string | null;
    valid_to?: string | null;
  },
): Promise<AacAuthorization> {
  const resp = await timedFetch(`${API_BASE}/api/titles/aacs/${aacId}/authorizations`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Authorization ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function decideAuthorization(
  id: number,
  decision: "delivre" | "rejete",
  motif?: string | null,
): Promise<{ id: number; aac_id: number; status: AuthorizationStatus }> {
  const resp = await timedFetch(`${API_BASE}/api/titles/authorizations/${id}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ decision, motif: motif ?? null }),
  });
  if (!resp.ok) throw new Error(`Authorization ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function notifyStartup(
  id: number,
): Promise<{ id: number; aac_id: number; status: AuthorizationStatus }> {
  const resp = await timedFetch(`${API_BASE}/api/titles/authorizations/${id}/notify-startup`, {
    method: "POST",
    headers: headers(true),
  });
  if (!resp.ok) throw new Error(`Startup ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export type TaxType =
  | "superficie"
  | "abattage"
  | "surveillance"
  | "transformation"
  | "renouvellement"
  | "transfert"
  | "fermage";
export type TaxStatus = "du" | "paye" | "en_retard";

export interface TaxReceipt {
  id: number;
  org_id: number | null;
  title_id: number | null;
  tax_type: TaxType;
  period_year: number | null;
  amount_fcfa: number | null;
  receipt_ref: string | null;
  paid_at: string | null;
  due_at: string | null;
  status: TaxStatus;
  created_at: string;
}

export async function listTaxes(): Promise<TaxReceipt[]> {
  const resp = await timedFetch(`${API_BASE}/api/taxes`, { headers: headers() });
  if (!resp.ok) throw new Error(`Taxes ${resp.status}`);
  return resp.json();
}

export async function recordTax(input: {
  tax_type: TaxType;
  period_year: number;
  amount_fcfa: number;
  paid_at?: string | null;
  receipt_ref?: string | null;
  title_id?: number | null;
}): Promise<TaxReceipt> {
  const resp = await timedFetch(`${API_BASE}/api/taxes`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Tax ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export interface ComplianceWarning {
  kind?: string;
  code?: string;
  tree_code?: string;
  doc_type?: string;
  status?: string;
  tax_type?: string;
  period_year?: number;
}

export interface ComplianceBlock {
  tree_code: string;
  code: string;
}

export interface ComplianceAssessment {
  declaration_id: number;
  blockers: ComplianceBlock[];
  warnings: ComplianceWarning[];
  compliant: boolean;
}

export async function assessFellingCompliance(id: number): Promise<ComplianceAssessment> {
  const resp = await timedFetch(`${API_BASE}/api/compliance/felling/${id}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Compliance ${resp.status}`);
  return resp.json();
}

// ---------------------------------------------------------------------------
// Traceability (Slice 4): carnet de chantier (DF10), transport, statements
// ---------------------------------------------------------------------------

/** Request headers incl. the current bearer token (used by PDF downloads). */
export function requestHeaders(json = false): Record<string, string> {
  return headers(json);
}

export type AbandonCode =
  | "abattu"
  | "creux"
  | "penche"
  | "malade"
  | "non_trouve"
  | "protege"
  | "hors_limite"
  | "dommage"
  | "autre";

export interface Df10Entry {
  tree_code: string;
  species_scientific_name: string | null;
  measured_dbh_cm: number | null;
  marking_type: string | null;
  status: string;
  hammer_mark: string | null;
  felled_at: string | null;
  df10_entry_no: string | null;
  abandon_code: AbandonCode | null;
  abandon_label: string | null;
  df10_notes: string | null;
  permit_number: string | null;
  aac_label: string | null;
  title_id: number | null;
  aac_id: number | null;
}

export async function listDf10(
  params: { status?: string; title_id?: number; aac_id?: number } = {},
): Promise<Df10Entry[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.title_id != null) qs.set("title_id", String(params.title_id));
  if (params.aac_id != null) qs.set("aac_id", String(params.aac_id));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const resp = await timedFetch(`${API_BASE}/api/traceability/df10${suffix}`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`DF10 ${resp.status}`);
  return resp.json();
}

export async function setDf10Abandon(
  treeCode: string,
  input: { abandon_code: string; notes?: string | null },
): Promise<Df10Entry> {
  const resp = await timedFetch(
    `${API_BASE}/api/traceability/df10/${encodeURIComponent(treeCode)}`,
    { method: "PATCH", headers: headers(true), body: JSON.stringify(input) },
  );
  if (!resp.ok) throw new Error(`DF10 ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export type TransportDocType = "bordereau_roulage" | "feuille_route" | "specification";
export type TransportStatus = "brouillon" | "emis" | "receptionne";

export interface TransportDocument {
  id: number;
  org_id: number;
  doc_type: TransportDocType;
  reference: string;
  from_label: string | null;
  to_label: string | null;
  tree_codes: string[];
  volume_m3: number | null;
  status: TransportStatus;
  transporter: string | null;
  vehicle_ref: string | null;
  title_id: number | null;
  aac_id: number | null;
  created_at: string;
}

export interface TransportTree {
  tree_code: string;
  species_scientific_name: string | null;
  measured_dbh_cm: number | null;
  status: string;
  hammer_mark: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface TransportDocumentDetail {
  document: TransportDocument;
  trees: TransportTree[];
}

export async function createTransportDocument(input: {
  doc_type: TransportDocType;
  tree_codes: string[];
  from_label?: string | null;
  to_label?: string | null;
  transporter?: string | null;
  vehicle_ref?: string | null;
  title_id?: number | null;
  aac_id?: number | null;
}): Promise<TransportDocument> {
  const resp = await timedFetch(`${API_BASE}/api/transport/documents`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Transport ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function listTransportDocuments(
  status?: TransportStatus,
): Promise<TransportDocument[]> {
  const suffix = status ? `?status=${status}` : "";
  const resp = await timedFetch(`${API_BASE}/api/transport/documents${suffix}`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Transport ${resp.status}`);
  return resp.json();
}

export async function getTransportDocument(id: number): Promise<TransportDocumentDetail> {
  const resp = await timedFetch(`${API_BASE}/api/transport/documents/${id}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Transport ${resp.status}`);
  return resp.json();
}

export async function actOnTransportDocument(
  id: number,
  status: "emis" | "receptionne",
): Promise<TransportDocument> {
  const resp = await timedFetch(`${API_BASE}/api/transport/documents/${id}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ status }),
  });
  if (!resp.ok) throw new Error(`Transport ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export interface StatementTotals {
  stems_felled: number;
  estimated_volume_m3: number;
  by_status: Record<string, number>;
}
export interface StatementSpecies {
  species: string;
  stems: number;
  volume_m3: number | null;
}
export interface StatementAbandon {
  code: string;
  label: string;
  count: number;
}
export interface Statement {
  period: { year: number; quarter: number | null };
  totals: StatementTotals;
  by_species: StatementSpecies[];
  transformation_rate: number;
  abandoned: StatementAbandon[];
  transport: { documents: number; volume_m3: number };
}

export async function getStatement(year: number, quarter?: number | null): Promise<Statement> {
  const qs = new URLSearchParams({ year: String(year) });
  if (quarter) qs.set("quarter", String(quarter));
  const resp = await timedFetch(`${API_BASE}/api/traceability/statements?${qs.toString()}`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Statement ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ---------------------------------------------------------------------------
// Fiscalité, social & EUDR (Slice 5)
// ---------------------------------------------------------------------------

export type DueStatus = "du" | "en_retard" | "paye";

export interface TaxDue {
  id: number;
  org_id: number | null;
  org_name: string | null;
  title_id: number | null;
  title_ref: string | null;
  tax_type: TaxType;
  period_year: number;
  amount_fcfa: number;
  due_at: string | null;
  notes: string | null;
  receipt_id: number | null;
  receipt_ref: string | null;
  paid_at: string | null;
  status: DueStatus;
  surcharge_fcfa: number;
  created_at: string;
}

export async function listTaxDues(
  params: { period_year?: number; status?: DueStatus; title_id?: number } = {},
): Promise<TaxDue[]> {
  const qs = new URLSearchParams();
  if (params.period_year != null) qs.set("period_year", String(params.period_year));
  if (params.status) qs.set("status", params.status);
  if (params.title_id != null) qs.set("title_id", String(params.title_id));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const resp = await timedFetch(`${API_BASE}/api/taxes/dues${suffix}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Dues ${resp.status}`);
  return resp.json();
}

export async function createTaxDue(input: {
  title_id: number;
  tax_type: TaxType;
  period_year: number;
  amount_fcfa: number;
  due_at?: string | null;
  notes?: string | null;
}): Promise<TaxDue> {
  const resp = await timedFetch(`${API_BASE}/api/taxes/dues`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Due ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function settleTaxDue(
  id: number,
  input: { amount_fcfa: number; receipt_ref?: string | null; paid_at?: string | null },
): Promise<TaxDue> {
  const resp = await timedFetch(`${API_BASE}/api/taxes/dues/${id}/settle`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Settle ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export type AgreementStatus = "actif" | "suspendu" | "clos";

export interface Community {
  id: number;
  name: string;
  address: string | null;
}

export interface CommunityAgreement {
  id: number;
  title_id: number | null;
  title_ref: string | null;
  community_org_id: number;
  community_name: string | null;
  ccc_ref: string | null;
  ccc_signed_at: string | null;
  fdl_rate_fcfa_m3: number;
  annual_volume_m3: number | null;
  contribution_fcfa: number | null;
  cgsp_minutes_document_id: number | null;
  status: AgreementStatus;
  created_at: string;
}

export interface CommunitySummary {
  by_status: { status: AgreementStatus; count: number; contribution_fcfa: number }[];
  total_count: number;
  total_contribution_fcfa: number;
}

export async function listCommunities(): Promise<Community[]> {
  const resp = await timedFetch(`${API_BASE}/api/community/communities`, { headers: headers() });
  if (!resp.ok) throw new Error(`Communities ${resp.status}`);
  return resp.json();
}

export async function listCommunityAgreements(): Promise<CommunityAgreement[]> {
  const resp = await timedFetch(`${API_BASE}/api/community/agreements`, { headers: headers() });
  if (!resp.ok) throw new Error(`Agreements ${resp.status}`);
  return resp.json();
}

export async function createCommunityAgreement(input: {
  title_id: number;
  community_org_id: number;
  ccc_ref?: string | null;
  ccc_signed_at?: string | null;
  fdl_rate_fcfa_m3?: number;
  annual_volume_m3?: number | null;
}): Promise<CommunityAgreement> {
  const resp = await timedFetch(`${API_BASE}/api/community/agreements`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Agreement ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function decideCommunityAgreement(
  id: number,
  input: {
    status: AgreementStatus;
    ccc_ref?: string | null;
    cgsp_minutes_document_id?: number | null;
  },
): Promise<CommunityAgreement> {
  const resp = await timedFetch(`${API_BASE}/api/community/agreements/${id}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Agreement ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function communitySummary(): Promise<CommunitySummary> {
  const resp = await timedFetch(`${API_BASE}/api/community/agreements/summary`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Summary ${resp.status}`);
  return resp.json();
}

export type EudrStatus = "soumis" | "valide" | "rejete";

export interface EudrDiligence {
  id: number;
  org_id: number | null;
  org_name: string | null;
  title_id: number | null;
  title_ref: string | null;
  parcel_label: string;
  parcel_wkt: string | null;
  consultation_document_id: number | null;
  geolocated_stem_count: number;
  felled_stem_count: number;
  declared_volume_m3: number | null;
  notes: string | null;
  status: EudrStatus;
  decision_motif: string | null;
  decided_at: string | null;
  created_at: string;
}

export async function listEudrDiligence(status?: EudrStatus): Promise<EudrDiligence[]> {
  const suffix = status ? `?status=${status}` : "";
  const resp = await timedFetch(`${API_BASE}/api/eudr/diligence${suffix}`, { headers: headers() });
  if (!resp.ok) throw new Error(`EUDR ${resp.status}`);
  return resp.json();
}

export async function createEudrDiligence(input: {
  title_id?: number | null;
  parcel_label: string;
  parcel_wkt?: string | null;
  consultation_document_id?: number | null;
  declared_volume_m3?: number | null;
  notes?: string | null;
}): Promise<EudrDiligence> {
  const resp = await timedFetch(`${API_BASE}/api/eudr/diligence`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`EUDR ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function decideEudrDiligence(
  id: number,
  input: { status: "valide" | "rejete"; motif?: string | null },
): Promise<EudrDiligence> {
  const resp = await timedFetch(`${API_BASE}/api/eudr/diligence/${id}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`EUDR ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// Certifications tierces (FSC / PAFC / PEFC / OLB / LS / TLV) — Slice 7
export type CertScheme = "FSC" | "PAFC" | "PEFC" | "OLB" | "LS" | "TLV";
export type CertType = "gestion_durable" | "legalite_plus";
export type CertStatus = "soumis" | "actif" | "suspendu" | "expire" | "rejete";

export interface Certification {
  id: number;
  org_id: number;
  title_id: number | null;
  scheme: CertScheme;
  cert_type: CertType;
  certificate_ref: string | null;
  surface_ha: number | null;
  valid_from: string | null;
  valid_to: string | null;
  declared_by?: number | null;
  verified_by?: number | null;
  verified_at?: string | null;
  decision_motif?: string | null;
  status: CertStatus;
  created_at: string;
  org_name?: string | null;
  title_ref?: string | null;
}

export interface CertificationSummary {
  by_status: { status: CertStatus; count: number; surface_ha: number }[];
  by_scheme: { scheme: CertScheme; count: number }[];
  total_count: number;
}

export async function listCertifications(
  params: { scheme?: CertScheme; status?: CertStatus } = {},
): Promise<Certification[]> {
  const query = new URLSearchParams();
  if (params.scheme) query.set("scheme", params.scheme);
  if (params.status) query.set("status", params.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const resp = await timedFetch(`${API_BASE}/api/certifications${suffix}`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Certifications ${resp.status}`);
  return resp.json();
}

export async function declareCertification(input: {
  scheme: CertScheme;
  cert_type: CertType;
  certificate_ref?: string | null;
  title_id?: number | null;
  surface_ha?: number | null;
  valid_from?: string | null;
  valid_to?: string | null;
}): Promise<Certification> {
  const resp = await timedFetch(`${API_BASE}/api/certifications`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Certification ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function decideCertification(
  id: number,
  decision: "actif" | "rejete" | "suspendu",
  decisionMotif?: string | null,
): Promise<Certification> {
  const resp = await timedFetch(`${API_BASE}/api/certifications/${id}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ decision, decision_motif: decisionMotif ?? null }),
  });
  if (!resp.ok) throw new Error(`Certification ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function certificationSummary(): Promise<CertificationSummary> {
  const resp = await timedFetch(`${API_BASE}/api/certifications/summary`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Summary ${resp.status}`);
  return resp.json();
}

export type AnomalyType =
  | "below_dme"
  | "felled_without_authorization"
  | "abattage_hors_aac"
  | "espece_reservee"
  | "aac_fermee"
  | "documents_expires"
  | "taxes_impayees"
  | "cites_sans_permis"
  | "transport_sans_bordereau";
export type AnomalySeverity = "hard" | "warning";
export type AnomalyReviewStatus = "ouverte" | "traitee" | "ecartee";

export interface AdminAnomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  label: string;
  subject_key: string;
  subject: string;
  detail: string;
  org_id: number | null;
  org_name: string | null;
  title_id: number | null;
  title_ref: string | null;
  aac_id: number | null;
  aac_label: string | null;
  detected_at: string | null;
  review_status: AnomalyReviewStatus;
  review_motif: string | null;
}

export interface AnomalyTypeSummary {
  type: AnomalyType;
  label: string;
  severity: AnomalySeverity;
  count: number;
  ouvertes: number;
}

export interface AnomalySummary {
  total: number;
  hard: number;
  warning: number;
  ouvertes: number;
  by_type: AnomalyTypeSummary[];
}

/** Ministry anomaly register (extended sweep), optionally filtered. */
export async function listAdminAnomalies(
  params: {
    type?: AnomalyType;
    severity?: AnomalySeverity;
    review?: AnomalyReviewStatus | "all";
  } = {},
): Promise<AdminAnomaly[]> {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.severity) query.set("severity", params.severity);
  if (params.review) query.set("review", params.review);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const resp = await timedFetch(`${API_BASE}/api/anomalies${suffix}`, { headers: headers() });
  if (!resp.ok) throw new Error(`Anomalies ${resp.status}`);
  return resp.json();
}

export async function anomalySummary(): Promise<AnomalySummary> {
  const resp = await timedFetch(`${API_BASE}/api/anomalies/summary`, { headers: headers() });
  if (!resp.ok) throw new Error(`Anomaly summary ${resp.status}`);
  return resp.json();
}

/** Record the Ministry decision for one detected anomaly. */
export async function reviewAnomaly(input: {
  anomaly_type: AnomalyType;
  subject_key: string;
  status: AnomalyReviewStatus;
  decision_motif?: string | null;
  title_id?: number | null;
  aac_id?: number | null;
  org_id?: number | null;
}): Promise<{
  anomaly_type: AnomalyType;
  subject_key: string;
  status: AnomalyReviewStatus;
  decision_motif: string | null;
}> {
  const resp = await timedFetch(`${API_BASE}/api/anomalies/review`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Anomaly review ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export interface StatusRollup {
  status: string;
  count: number;
  surface_ha?: number;
  possibility_m3?: number;
}

export interface DashboardOverview {
  generated_at: string;
  harvest: {
    registry_stems: number;
    stems_felled: number;
    estimated_volume_m3: number;
    by_species: { species: string; stems: number; volume_m3: number }[];
    by_status: Record<string, number>;
    transformation_rate: number;
  };
  titles: { total: number; by_status: Record<string, StatusRollup>; surface_ha: number };
  aac: { total: number; by_status: Record<string, StatusRollup>; possibility_m3: number };
  documents: {
    total: number;
    by_status: Record<string, StatusRollup>;
    expired: number;
    expiring_soon: number;
  };
  taxes: {
    dues_total: number;
    overdue: number;
    settled: number;
    overdue_amount_fcfa: number;
    receipts: number;
    receipts_amount_fcfa: number;
  };
  community: {
    agreements: number;
    active: number;
    contribution_fcfa: number;
    annual_volume_m3: number;
    avg_fdl_rate: number;
  };
  transport: { documents: number; volume_m3: number };
  certifications: {
    total: number;
    by_status: Record<string, StatusRollup>;
    by_scheme: { scheme: string; count: number; surface_ha: number }[];
  };
}

export async function dashboardOverview(): Promise<DashboardOverview> {
  const resp = await timedFetch(`${API_BASE}/api/dashboard`, { headers: headers() });
  if (!resp.ok) throw new Error(`Dashboard ${resp.status}`);
  return resp.json();
}
