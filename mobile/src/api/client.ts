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
  dbh_vision_cm?: number | null;
  dbh_uncertainty_cm?: number | null;
  dbh_discrepancy_pct?: number | null;
  measurement_notes?: string[];
  height_method?: string | null;
  aboveground_biomass_kg?: number | null;
  carbon_stock_kg?: number | null;
  co2e_kg?: number | null;
  distance_m?: number | null;
  distance_source?: "lidar" | "arcore" | "qr" | "typed" | "ai" | null;
  tree_code?: string | null;
  species_candidates?: {
    scientific_name: string;
    common_name_fr: string | null;
    score: number;
    combined: number;
    prior: string;
    local_occurrences: number | null;
  }[];
  species_flora?: string | null;
  forest_checks?: ForestChecks | null;
  project_id?: number | null;
  project_title?: string | null;
  project_note?: ProjectNote | null;
}

export type ProjectNote =
  | "project_closed"
  | "project_not_member"
  | "project_out_of_zone"
  | "project_unknown"
  | "project_login_required";

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

export type Organ = "bark" | "leaf" | "flower" | "fruit" | "whole" | "dbh";

export interface CaptureShot {
  image: CapturedImage;
  organ: Organ;
  /** Orbit azimuth in degrees (0/90/180/270); omitted for organ close-ups. */
  azimuth?: number;
  /** 35 mm-equivalent focal length read from the photo EXIF. */
  focal35mm?: number;
}

const ORGAN_WIRE: Record<Organ, string> = {
  bark: "bark",
  leaf: "leaf",
  flower: "flower",
  fruit: "fruit",
  whole: "whole",
  dbh: "dbh",
};

export type HeightSource = "clinometer" | "manual";

export interface ScanCapabilities {
  ai_segmentation: boolean;
  ai_distance: boolean;
  ai_configured?: boolean;
  /** Why the AI is off: "disabled" (not enabled) or "memory" (server too small). */
  ai_off_reason?: "disabled" | "memory" | null;
  max_image_bytes?: number;
  /** Client-side: the server could not be reached. */
  offline?: boolean;
}

/** Server-side scanner abilities; all off when the server is unreachable. */
export async function getScanCapabilities(): Promise<ScanCapabilities> {
  try {
    const resp = await timedFetch(`${API_BASE}/api/v1/capabilities`, { headers: headers() });
    if (!resp.ok) throw new Error(`capabilities ${resp.status}`);
    return resp.json();
  } catch {
    return { ai_segmentation: false, ai_distance: false, offline: true };
  }
}

export interface TreeMeasurements {
  /** Distance from the phone to the bark at 1.30 m (m) — enables photo DBH. */
  arDepthM?: number;
  focalPx?: number;
  focal35mm?: number;
  /** Tape circumference at 1.30 m (cm) — the field reference. */
  circumferenceCm?: number;
  /** Forest caliper diameter at 1.30 m (cm). */
  caliperDbhCm?: number;
  measuredHeightM?: number;
  heightSource?: HeightSource;
  /** Registry code of the tree (scanned from its QR tag). */
  treeCode?: string;
  /** Where `arDepthM` comes from when a native sensor measured it. */
  depthSource?: "lidar" | "arcore";
  /** Trunk edges confirmed by the operator on the DBH photo (fractions 0..1). */
  edgeLeft?: number;
  edgeRight?: number;
  /** Scan made for a chantier / project (attached server-side if allowed). */
  projectId?: number;
}

/** Focal length shared by the scan: the DBH shot first, else any shot. */
export function scanFocal35mm(shots: CaptureShot[]): number | undefined {
  const dbh = shots.find((s) => s.organ === "dbh" && s.focal35mm);
  return (dbh ?? shots.find((s) => s.focal35mm))?.focal35mm;
}

export async function processScanV1(
  params: {
    shots: CaptureShot[];
    latitude: number;
    longitude: number;
  } & TreeMeasurements,
): Promise<V1Report> {
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
  const optional: Array<[string, number | string | undefined]> = [
    ["ar_depth_m", params.arDepthM],
    ["focal_px", params.focalPx],
    ["focal_35mm", params.focal35mm ?? scanFocal35mm(params.shots)],
    ["circumference_cm", params.circumferenceCm],
    ["caliper_dbh_cm", params.caliperDbhCm],
    ["measured_height_m", params.measuredHeightM],
    ["height_source", params.measuredHeightM ? params.heightSource : undefined],
    ["tree_code", params.treeCode?.trim() || undefined],
    ["depth_source", params.arDepthM ? params.depthSource : undefined],
    ["edge_left", params.edgeRight != null ? params.edgeLeft?.toFixed(4) : undefined],
    ["edge_right", params.edgeLeft != null ? params.edgeRight?.toFixed(4) : undefined],
    ["project_id", params.projectId],
  ];
  optional.forEach(([key, value]) => {
    if (value !== undefined && value !== "" && !(typeof value === "number" && !(value > 0))) {
      form.append(key, String(value));
    }
  });

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
  first_name?: string | null;
  last_name?: string | null;
  matricule?: string | null;
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
  | "receptionne"
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
  title_id?: number | null;
  aac_id?: number | null;
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
  aac_id?: number | null;
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
  return postJson("/api/felling/events", input, "Custody");
}

export interface CustodyHistoryEntry {
  event: CustodyEventKind;
  created_at: string;
  note: string | null;
  transport_document_id: number | null;
  actor: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface TreeCustody {
  tree_code: string;
  status: RegistryStatus;
  status_label: string;
  species_scientific_name: string | null;
  measured_dbh_cm: number | null;
  marking_type: MarkingType | null;
  hammer_mark: string | null;
  df10_entry_no: string | null;
  felled_at: string | null;
  aac_label: string | null;
  custodian_name: string | null;
  history: CustodyHistoryEntry[];
  transport: {
    id: number;
    reference: string;
    doc_type: TransportDocType;
    status: TransportStatus;
    destination_name: string | null;
    to_label: string | null;
  } | null;
  is_holder: boolean;
  next_event: "abattu" | "transforme" | null;
  can_receive: boolean;
}

export async function getTreeCustody(code: string): Promise<TreeCustody> {
  const resp = await timedFetch(`${API_BASE}/api/felling/trees/${encodeURIComponent(code)}`, {
    headers: headers(),
  });
  if (!resp.ok) {
    let detail = "";
    try {
      const data = await resp.json();
      detail = typeof data?.detail === "string" ? data.detail : "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Tree ${resp.status}`);
  }
  return resp.json();
}

/** A scanned QR is either a plate (bare tree code) or a slip (type|reference|n|volume). */
export function parseScannedCode(raw: string): { kind: "tree" | "slip"; code: string } {
  const value = raw.trim();
  const parts = value.split("|");
  if (parts.length >= 2 && ["bordereau_roulage", "feuille_route", "specification"].includes(parts[0])) {
    return { kind: "slip", code: parts[1] };
  }
  return { kind: "tree", code: value };
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
  first_name?: string | null;
  last_name?: string | null;
  matricule?: string | null;
}

export async function listUsers(): Promise<AdminUser[]> {
  const resp = await timedFetch(`${API_BASE}/api/admin/users`, { headers: headers() });
  if (!resp.ok) throw new Error(`Admin users ${resp.status}`);
  return resp.json();
}

export interface CreateUserPayload {
  email: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  matricule?: string;
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
  co2e_kg?: number | null;
  tree_code?: string | null;
  eudr_verdict?: EudrVerdict | null;
}

export type EudrVerdict = "conforme" | "a_verifier" | "risque_deforestation" | "indisponible";

export interface ForestChecks {
  source?: string;
  verdict: EudrVerdict;
  flags: string[];
  unavailable?: string[];
  loss_years?: number[] | null;
  radd_alerts?: number | null;
  radd_latest?: string | null;
  natural_forest_2020?: boolean | null;
  mapped_agb_mg_ha?: number | null;
  protected_area?: string | null;
  logging_concession?: string | null;
  local_layers?: { layer: string; name: string | null }[];
}

export interface MapTileLayer {
  key: string;
  label: string;
  url: string;
  source: string;
}

export interface GeoFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

export interface MapLayers {
  labels: Record<string, string>;
  counts?: Record<string, number>;
  tolerance?: number;
  layers: Record<string, { type: "FeatureCollection"; features: GeoFeature[] }>;
}

export interface NationalContext {
  country: string;
  source: string;
  highlights: { key: string; label: string; value: number | null; unit: string }[];
  emissions_by_year: { year: number; co2e_mg: number | null }[];
  emissions_latest_year: number | null;
  emissions_by_driver: {
    driver: string;
    label: string;
    latest_co2e_mg: number;
    latest_share: number | null;
  }[];
  provinces: { code: string; name: string; tree_cover_2000_ha?: number | null }[];
}

async function getJson<T>(path: string): Promise<T> {
  const resp = await timedFetch(`${API_BASE}${path}`, { headers: headers() });
  if (!resp.ok) throw new Error(`${path} ${resp.status}`);
  return resp.json();
}

export const getMapTiles = () => getJson<MapTileLayer[]>("/api/map/tiles");
export const getNationalContext = () => getJson<NationalContext>("/api/map/context");

/** Vector layers for the visible area, simplified server-side for `zoom`. */
export function getMapLayers(params?: {
  zoom?: number;
  bbox?: [number, number, number, number];
  layers?: string[];
}): Promise<MapLayers> {
  const q: string[] = [];
  if (params?.zoom != null) q.push(`zoom=${params.zoom.toFixed(1)}`);
  if (params?.bbox) q.push(`bbox=${params.bbox.map((v) => v.toFixed(4)).join(",")}`);
  if (params?.layers?.length) q.push(`layers=${params.layers.join(",")}`);
  return getJson<MapLayers>(`/api/map/layers${q.length ? `?${q.join("&")}` : ""}`);
}

export interface MapSearchResult {
  kind: "gfw" | "aac" | "tree";
  layer: string;
  id: number | null;
  name: string;
  subtitle: string | null;
  lat: number | null;
  lon: number | null;
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
}

export const searchMap = (q: string) =>
  getJson<MapSearchResult[]>(`/api/map/search?q=${encodeURIComponent(q)}`);

export interface MapFeatureDetail {
  id: number;
  layer: string;
  name: string | null;
  attrs?: Record<string, unknown>;
  area_ha?: number | null;
  lat?: number | null;
  lon?: number | null;
  status?: string | null;
  holder?: string | null;
  title_ref?: string | null;
  campaign_year?: number | null;
}

export const getMapFeature = (layer: string, id: number) =>
  getJson<MapFeatureDetail>(`/api/map/feature/${layer}/${id}`);

/** GFW checks at a point; `null` when GFW is not configured on the server. */
export async function checkMapPoint(lat: number, lon: number): Promise<ForestChecks | null> {
  const resp = await timedFetch(`${API_BASE}/api/map/point-check?lat=${lat}&lon=${lon}`, {
    headers: headers(),
  });
  if (resp.status === 503) return null;
  if (!resp.ok) throw new Error(`point-check ${resp.status}`);
  return resp.json();
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
export type ProjectKind = "chantier" | "participatif";
export type ProjectParticipation = "open" | "invitation";
export type ParticipantStatus = "invited" | "active" | "declined";

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
  kind?: ProjectKind;
  participation?: ProjectParticipation;
  aac_id?: number | null;
  aac_label?: string | null;
  aac_lat?: number | null;
  aac_lon?: number | null;
  registry_trees?: number;
  registry_scanned?: number;
  my_status?: ParticipantStatus | null;
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

export interface ProjectParticipant {
  user_id: number;
  status: ParticipantStatus;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  matricule: string | null;
}

export interface ProjectDetail extends Project {
  species_count: number;
  contributor_count: number;
  is_participant: boolean;
  my_scan_count?: number;
  contributions: ProjectContribution[];
  participants?: ProjectParticipant[];
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
  kind?: ProjectKind;
  participation?: ProjectParticipation;
  aac_id?: number | null;
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

async function projectAction(id: number, action: "accept" | "decline"): Promise<{ id: number; status: ParticipantStatus }> {
  const resp = await timedFetch(`${API_BASE}/api/projects/${id}/${action}`, {
    method: "POST",
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Project ${action} ${resp.status}`);
  return resp.json();
}

export const acceptProjectInvitation = (id: number) => projectAction(id, "accept");
export const declineProjectInvitation = (id: number) => projectAction(id, "decline");

export async function inviteToProject(id: number, emails: string[]): Promise<{ id: number; invited: number[] }> {
  const resp = await timedFetch(`${API_BASE}/api/projects/${id}/invite`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ emails }),
  });
  if (!resp.ok) throw new Error(`Invite ${resp.status}`);
  return resp.json();
}

export interface AacOption {
  id: number;
  label: string;
  status: string;
  campaign_year: number | null;
  ufa_label: string;
  title_reference: string | null;
  registry_trees: number;
}

export async function listAacOptions(): Promise<AacOption[]> {
  const resp = await timedFetch(`${API_BASE}/api/projects/aac-options`, { headers: headers() });
  if (!resp.ok) throw new Error(`AAC options ${resp.status}`);
  return resp.json();
}

/** A project as listed on the Accueil (joined, invited or open to join). */
export interface HomeProject {
  id: number;
  title: string;
  kind: ProjectKind;
  participation: ProjectParticipation;
  objective: ProjectObjective;
  status: ProjectStatus;
  target_type: ProjectTargetType;
  target_value: string;
  my_status?: ParticipantStatus;
  my_scans?: number;
  scans: number;
  participants: number;
  aac_id?: number | null;
  aac_label?: string | null;
  registry_trees?: number;
  registry_scanned?: number;
}

/** Accueil filter periods (Africa/Libreville day for "today"). */
export type HomePeriod = "today" | "week" | "month" | "all";

export interface HomeSummary {
  person: {
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    matricule: string | null;
    display_name: string;
    role: Role;
  };
  scans: {
    total: number;
    today: number;
    week: number;
    species: number;
    co2e_kg: number;
    for_projects: number;
    last_at: string | null;
    periods?: Record<HomePeriod, { count: number; species: number; co2e_kg: number; for_projects: number }>;
  };
  group: {
    type: "company" | "cooperative";
    name: string | null;
    members: number;
    trees: number;
    trees_week: number;
    trees_by_period?: Record<HomePeriod, number>;
  } | null;
  projects: {
    invitations: HomeProject[];
    joined: HomeProject[];
    available: HomeProject[];
    /** Open projects the person could join (the list shows at most 5). */
    available_count?: number;
  };
}

export async function getHomeSummary(): Promise<HomeSummary> {
  const resp = await timedFetch(`${API_BASE}/api/home/summary`, { headers: headers() });
  if (!resp.ok) throw new Error(`Home summary ${resp.status}`);
  return resp.json();
}

export async function updateMyNames(firstName: string, lastName: string): Promise<{
  id: number;
  first_name: string;
  last_name: string;
  matricule: string | null;
  display_name: string;
}> {
  const resp = await timedFetch(`${API_BASE}/api/home/me`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ first_name: firstName, last_name: lastName }),
  });
  if (!resp.ok) throw new Error(`Names ${resp.status}`);
  return resp.json();
}

export interface ChantierTree {
  id: number;
  tree_code: string;
  species_scientific_name: string | null;
  status: string;
  measured_dbh_cm: number | null;
  latitude: number | null;
  longitude: number | null;
  measured: boolean;
  measured_by_me: boolean;
}

export interface ChantierView {
  id: number;
  title: string;
  description: string;
  status: ProjectStatus;
  kind: "chantier";
  participation: ProjectParticipation;
  aac_id: number | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
  my_status: ParticipantStatus | null;
  aac: {
    id: number;
    label: string;
    status: string;
    campaign_year: number | null;
    surface_ha: number | null;
    ufa_label: string;
    title_reference: string | null;
    geometry: { type: string; coordinates: unknown } | null;
  } | null;
  trees: ChantierTree[];
  progress: { measured: number; total: number };
  team: {
    user_id: number;
    status: ParticipantStatus;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    scans: number;
  }[];
  my_scans: {
    id: number;
    species_scientific_name: string | null;
    measured_dbh_cm: number | null;
    tree_code: string | null;
    created_at: string;
  }[];
}

export async function getChantier(id: number): Promise<ChantierView> {
  const resp = await timedFetch(`${API_BASE}/api/projects/${id}/chantier`, { headers: headers() });
  if (!resp.ok) throw new Error(`Chantier ${resp.status}`);
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

/** A login still acting as its own legal entity (no ``organization_id``). */
export interface OrphanAccount {
  id: number;
  email: string | null;
  display_name: string;
  role: "company" | "cooperative";
  created_at: string;
}

export interface LegacyOrganization {
  id: number;
  org_type: "entreprise" | "cooperative";
  name: string;
  legacy_user_id: number;
}

export interface LinkedAccount {
  id: number;
  email: string | null;
  organization_id: number;
}

export interface OrgBackfillResult {
  created: LegacyOrganization[];
  linked: LinkedAccount[];
  created_count: number;
  linked_count: number;
}

/** Legacy accounts (Slice 13): company/cooperative without an organization. */
export async function listOrphanAccounts(): Promise<OrphanAccount[]> {
  const resp = await timedFetch(`${API_BASE}/api/organizations/orphans`, { headers: headers() });
  if (!resp.ok) throw new Error(`Orphans ${resp.status}`);
  return resp.json();
}

/** Create+link one organization per legacy account (idempotent, Ministry). */
export async function backfillAccounts(): Promise<OrgBackfillResult> {
  const resp = await timedFetch(`${API_BASE}/api/organizations/backfill`, {
    method: "POST",
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Backfill ${resp.status}`);
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

export type DmeOrigin = "ufa" | "provisional" | "unknown";

export interface UfaDmeEntry {
  species_scientific_name: string;
  dme_cm: number;
  source: string | null;
  origin: DmeOrigin;
}

export interface UfaDmeView {
  ufa_id: number;
  title_id: number;
  label: string;
  entries: UfaDmeEntry[];
}

export async function getUfaDme(ufaId: number): Promise<UfaDmeView> {
  const resp = await timedFetch(`${API_BASE}/api/titles/units/${ufaId}/dme`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`DME ${resp.status}`);
  return resp.json();
}

export async function setUfaDme(
  ufaId: number,
  entries: { species_scientific_name: string; dme_cm: number; source?: string | null }[],
): Promise<UfaDmeView> {
  const resp = await timedFetch(`${API_BASE}/api/titles/units/${ufaId}/dme`, {
    method: "PUT",
    headers: headers(true),
    body: JSON.stringify({ entries }),
  });
  if (!resp.ok) throw new Error(`DME ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function clearUfaDme(ufaId: number, species: string): Promise<UfaDmeView> {
  const resp = await timedFetch(
    `${API_BASE}/api/titles/units/${ufaId}/dme/${encodeURIComponent(species)}`,
    { method: "DELETE", headers: headers(true) },
  );
  if (!resp.ok) throw new Error(`DME ${resp.status}: ${await resp.text()}`);
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

export type ConventionType = "provisoire" | "definitive";
export type ConventionStatus = "active" | "expiree" | "resiliee";

export interface TitleConvention {
  id: number;
  title_id: number;
  convention_type: ConventionType;
  reference: string;
  signed_at: string | null;
  start_date: string | null;
  end_date: string | null;
  surface_ha: number | null;
  status: ConventionStatus;
  attestation_ref: string | null;
  attestation_issued_at: string | null;
  attestation_issued_by?: number | null;
  decision_motif?: string | null;
  created_at: string;
  title_ref?: string | null;
  org_name?: string | null;
}

export async function listConventions(titleId: number): Promise<TitleConvention[]> {
  const resp = await timedFetch(`${API_BASE}/api/titles/${titleId}/conventions`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Conventions ${resp.status}`);
  return resp.json();
}

export async function createConvention(
  titleId: number,
  input: {
    convention_type: ConventionType;
    reference: string;
    signed_at?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    surface_ha?: number | null;
    motif?: string | null;
  },
): Promise<TitleConvention> {
  const resp = await timedFetch(`${API_BASE}/api/titles/${titleId}/conventions`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Convention ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function decideConvention(
  titleId: number,
  conventionId: number,
  status: ConventionStatus,
  motif?: string | null,
): Promise<{
  id: number;
  title_id: number;
  status: ConventionStatus;
  title_status?: TitleStatus;
}> {
  const resp = await timedFetch(`${API_BASE}/api/titles/${titleId}/conventions/${conventionId}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ status, motif: motif ?? null }),
  });
  if (!resp.ok) throw new Error(`Convention ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function issueAttestation(
  titleId: number,
  conventionId: number,
  reference: string,
): Promise<{
  id: number;
  title_id: number;
  attestation_ref: string | null;
  attestation_issued_at: string | null;
}> {
  const resp = await timedFetch(
    `${API_BASE}/api/titles/${titleId}/conventions/${conventionId}/attestation`,
    { method: "POST", headers: headers(true), body: JSON.stringify({ reference }) },
  );
  if (!resp.ok) throw new Error(`Attestation ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export type StudyType = "ppf" | "eie";
export type StudyStatus = "soumis" | "valide" | "rejete" | "expire";

export interface EnvironmentalStudy {
  id: number;
  title_id: number;
  study_type: StudyType;
  reference: string;
  authority: string | null;
  conducted_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  status: StudyStatus;
  certificate_ref: string | null;
  certificate_issued_at: string | null;
  certificate_issued_by?: number | null;
  decision_motif?: string | null;
  created_at: string;
  title_ref?: string | null;
  org_name?: string | null;
}

export async function listStudies(titleId: number): Promise<EnvironmentalStudy[]> {
  const resp = await timedFetch(`${API_BASE}/api/titles/${titleId}/studies`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`Studies ${resp.status}`);
  return resp.json();
}

export async function createStudy(
  titleId: number,
  input: {
    study_type: StudyType;
    reference: string;
    authority?: string | null;
    conducted_at?: string | null;
    valid_from?: string | null;
    valid_to?: string | null;
  },
): Promise<EnvironmentalStudy> {
  const resp = await timedFetch(`${API_BASE}/api/titles/${titleId}/studies`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`Study ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function decideStudy(
  titleId: number,
  studyId: number,
  decision: "valide" | "rejete",
  motif?: string | null,
): Promise<{ id: number; title_id: number; status: StudyStatus; decision_motif?: string | null }> {
  const resp = await timedFetch(`${API_BASE}/api/titles/${titleId}/studies/${studyId}`, {
    method: "PATCH",
    headers: headers(true),
    body: JSON.stringify({ decision, motif: motif ?? null }),
  });
  if (!resp.ok) throw new Error(`Study ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function issueStudyCertificate(
  titleId: number,
  studyId: number,
  reference: string,
): Promise<{
  id: number;
  title_id: number;
  certificate_ref: string | null;
  certificate_issued_at: string | null;
}> {
  const resp = await timedFetch(
    `${API_BASE}/api/titles/${titleId}/studies/${studyId}/certificate`,
    { method: "POST", headers: headers(true), body: JSON.stringify({ reference }) },
  );
  if (!resp.ok) throw new Error(`Certificate ${resp.status}: ${await resp.text()}`);
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
  destination_org_id?: number | null;
  destination_name?: string | null;
  org_name?: string | null;
  received_at?: string | null;
  direction?: "entrant" | "sortant";
}

export interface TransportDestination {
  id: number;
  name: string;
  org_type: string;
}

export const listTransportDestinations = () =>
  getLabeled<TransportDestination[]>("/api/transport/destinations", "Destinations");

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
  destination_org_id?: number | null;
}): Promise<TransportDocument> {
  const resp = await timedFetch(`${API_BASE}/api/transport/documents`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(await transportError(resp));
  return resp.json();
}

async function transportError(resp: Response): Promise<string> {
  try {
    const data = await resp.json();
    if (typeof data?.detail === "string") return data.detail;
    if (data?.detail?.message) {
      const codes: string[] = data.detail.tree_codes ?? [];
      return codes.length ? `${data.detail.message} : ${codes.join(", ")}` : data.detail.message;
    }
  } catch {
    return `Transport ${resp.status}`;
  }
  return `Transport ${resp.status}`;
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
  if (!resp.ok) throw new Error(await transportError(resp));
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
  inside_parcel_stem_count: number;
  outside_parcel_stem_count: number;
  declared_volume_m3: number | null;
  notes: string | null;
  status: EudrStatus;
  decision_motif: string | null;
  decided_at: string | null;
  created_at: string;
}

/** One harvested stem geolocated against a diligence's declared parcel. */
export interface DiligenceStem {
  tree_code: string;
  species_scientific_name: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  inside: boolean | null;
}

export async function listDiligenceStems(id: number): Promise<DiligenceStem[]> {
  const resp = await timedFetch(`${API_BASE}/api/eudr/diligence/${id}/stems`, {
    headers: headers(),
  });
  if (!resp.ok) throw new Error(`EUDR stems ${resp.status}`);
  return resp.json();
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
  carbon?: {
    scans: number;
    co2e_kg: number;
    reference_scans: number;
    linked_scans: number;
    by_aac: {
      aac_id: number;
      aac_label: string;
      title_ref: string | null;
      scans: number;
      co2e_kg: number;
    }[];
  };
}

export async function dashboardOverview(): Promise<DashboardOverview> {
  const resp = await timedFetch(`${API_BASE}/api/dashboard`, { headers: headers() });
  if (!resp.ok) throw new Error(`Dashboard ${resp.status}`);
  return resp.json();
}

// ---------------------------------------------------------------------------
// Espace Ministère (Slice 20): inbox, provinces, organisations, titles
// ---------------------------------------------------------------------------

export type InboxQueueKey =
  | "followups"
  | "declarations"
  | "documents"
  | "authorizations"
  | "pao"
  | "studies"
  | "certifications"
  | "eudr"
  | "titles"
  | "anomalies"
  | "orphans";

export interface InboxQueue {
  key: InboxQueueKey;
  label: string;
  authority: string;
  count: number;
  oldest_at: string | null;
}

export interface InboxAlert {
  level: "risk" | "warn";
  kind: "anomalies_hard" | "documents_expired" | "taxes_overdue" | "statements_overdue" | "aac_open_too_long";
  count: number;
  amount_fcfa?: number;
}

export interface AdminInbox {
  total: number;
  queues: InboxQueue[];
  alerts: InboxAlert[];
}

export interface InboxItem extends Partial<Competence> {
  id: number;
  type: InboxQueueKey;
  label: string;
  org_name: string | null;
  created_at: string | null;
  authority: string;
  province_code: string | null;
  province_name: string | null;
}

export interface ProvinceSummary {
  code: string;
  name: string;
  organisations: number;
  titles: number;
  surface_ha: number;
}

export interface OrganisationEntry {
  id: number;
  org_type: OrgType;
  name: string;
  profile_code: string | null;
  profile_label: string | null;
  is_active: boolean;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  titles: number;
  surface_ha: number;
  provinces: string[];
  accounts: number;
  documents_missing: number;
  documents_pending: number;
  taxes_overdue: number;
}

export interface OrganisationSheetFull {
  entry: OrganisationEntry;
  titles: {
    id: number;
    title_type: string;
    reference: string | null;
    status: string;
    zone: string;
    surface_ha: number | null;
    province_code: string | null;
    province_source: "manuel" | "geometrie" | null;
    province_name: string | null;
  }[];
  accounts: {
    id: number;
    email: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    matricule: string | null;
    role: Role;
    is_active: boolean;
  }[];
  certifications: { id: number; scheme: string; cert_type: string; status: string; valid_to: string | null }[];
  warnings: { kind: string; doc_type?: string; status?: string; tax_type?: string; period_year?: number; label?: string }[];
}

async function getLabeled<T>(path: string, label: string): Promise<T> {
  const resp = await timedFetch(`${API_BASE}${path}`, { headers: headers() });
  if (!resp.ok) throw new Error(`${label} ${resp.status}`);
  return resp.json();
}

async function postJson<T>(path: string, body: unknown, label: string): Promise<T> {
  const resp = await timedFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let detail = "";
    try {
      const data = await resp.json();
      detail = typeof data?.detail === "string" ? data.detail : "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `${label} ${resp.status}`);
  }
  return resp.json();
}

export const getAdminInbox = () => getLabeled<AdminInbox>("/api/admin/inbox", "Inbox");

export function getInboxItems(type?: InboxQueueKey | null, province?: string | null): Promise<InboxItem[]> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (province) params.set("province", province);
  const q = params.toString();
  return getLabeled<InboxItem[]>(`/api/admin/inbox/items${q ? `?${q}` : ""}`, "Inbox items");
}

export const getProvinces = () => getLabeled<ProvinceSummary[]>("/api/admin/provinces", "Provinces");

export function getOrganisationDirectory(province?: string | null, type?: OrgType | null): Promise<OrganisationEntry[]> {
  const params = new URLSearchParams();
  if (province) params.set("province", province);
  if (type) params.set("type", type);
  const q = params.toString();
  return getLabeled<OrganisationEntry[]>(`/api/organizations/directory${q ? `?${q}` : ""}`, "Directory");
}

export async function getOrganisationSheet(id: number): Promise<OrganisationSheetFull> {
  const raw = await getLabeled<
    OrganisationEntry & {
      titles: OrganisationSheetFull["titles"];
      accounts: OrganisationSheetFull["accounts"];
      certifications: OrganisationSheetFull["certifications"];
      warnings: OrganisationSheetFull["warnings"];
    }
  >(`/api/organizations/${id}/sheet`, "Sheet");
  const { titles, accounts, certifications, warnings, ...entry } = raw;
  return {
    entry: { ...(entry as unknown as OrganisationEntry), titles: titles.length, accounts: accounts.length },
    titles,
    accounts,
    certifications,
    warnings,
  };
}

export function createOrganisation(input: {
  name: string;
  profile_code?: string | null;
  org_type?: OrgType | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<{ organization: { id: number; org_type: OrgType; profile_code: string | null } }> {
  return postJson("/api/organizations", input, "Create organisation");
}

export function createOrganisationAccount(
  orgId: number,
  input: {
    email: string;
    password: string;
    role: "company" | "operator" | "cooperative";
    first_name?: string;
    last_name?: string;
    matricule?: string;
  },
): Promise<{ id: number; email: string; display_name: string }> {
  return postJson(`/api/organizations/${orgId}/accounts`, input, "Create account");
}

export function registerTitle(input: {
  holder_org_id: number;
  title_type: "CFAD" | "PFA" | "PGG" | "FC";
  reference?: string | null;
  zone?: "permanent" | "rural";
  surface_ha?: number | null;
  status?: "demande" | "exploration" | "provisoire" | "actif";
  province_code?: string | null;
}): Promise<{ id: number; status: string; province_code: string | null }> {
  return postJson("/api/titles/register", input, "Register title");
}

export function setTitleProvince(titleId: number, provinceCode: string | null): Promise<{ id: number; province_code: string | null }> {
  return postJson(`/api/titles/${titleId}/province`, { province_code: provinceCode }, "Title province");
}

export type AacBlocker = "no_aac" | "aac_not_held" | "no_authorization" | "authorization_pending" | "startup_not_notified";

export interface FellingAacOption {
  id: number;
  label: string;
  status: string;
  campaign_year: number | null;
  ufa_label: string;
  title_id: number;
  title_type: string;
  title_reference: string | null;
  blocker: AacBlocker | null;
}

export const listFellingAacOptions = () => getLabeled<FellingAacOption[]>("/api/felling/aac-options", "AAC options");

// ---------------------------------------------------------------------------
// Slice 21: unified decision page, field controls
// ---------------------------------------------------------------------------

export type CheckLevel = "ok" | "ko" | "warn";

export interface InboxDetail extends InboxItem {
  facts: { label: string; value: string }[];
  checks: { level: CheckLevel; label: string }[];
  items: { label: string; detail: string; flags: string[] }[];
  approve_label: string;
  blocking: boolean;
}

export const getInboxDetail = (type: InboxQueueKey, id: number) =>
  getLabeled<InboxDetail>(`/api/admin/inbox/${type}/${id}`, "Inbox detail");

export function decideInbox(type: InboxQueueKey, id: number, approve: boolean, motif?: string | null): Promise<unknown> {
  return postJson(`/api/admin/inbox/${type}/${id}/decision`, { approve, motif: motif ?? null }, "Decision");
}

export type ControlType = "marquage" | "visa_df10" | "route" | "transformation";
export type ControlResult = "conforme" | "reserve" | "non_conforme";

export interface ControlLookup {
  kind: "tree" | "transport" | "unknown";
  code: string;
  tree?: {
    tree_code: string;
    status: string;
    species_scientific_name: string | null;
    hammer_mark: string | null;
    df10_entry_no: string | null;
    aac_id: number | null;
    aac_label: string | null;
    org_id: number | null;
    org_name: string | null;
  };
  transport?: { id: number; reference: string; status: string; tree_codes?: string[]; org_id?: number | null; aac_id?: number | null } | null;
  checks: { level: CheckLevel; label: string }[];
}

export interface FieldControl extends Partial<Competence> {
  id: number;
  control_type: ControlType;
  result: ControlResult;
  tree_code: string | null;
  transport_document_id: number | null;
  aac_id: number | null;
  aac_label: string | null;
  org_id: number | null;
  org_name: string | null;
  notes: string | null;
  pv_reference: string | null;
  controlled_at: string;
  controlled_by_name: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const lookupControlCode = (code: string) =>
  getLabeled<ControlLookup>(`/api/controls/lookup?code=${encodeURIComponent(code)}`, "Lookup");

export function listFieldControls(type?: ControlType | null, result?: ControlResult | null): Promise<FieldControl[]> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (result) params.set("result", result);
  const q = params.toString();
  return getLabeled<FieldControl[]>(`/api/controls${q ? `?${q}` : ""}`, "Controls");
}

export function createFieldControl(input: {
  control_type: ControlType;
  result: ControlResult;
  tree_code?: string | null;
  transport_document_id?: number | null;
  aac_id?: number | null;
  org_id?: number | null;
  notes?: string | null;
  pv_reference?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{ id: number }> {
  return postJson("/api/controls", input, "Create control");
}

export interface Competence {
  acting_authority: string;
  competent_codes: string[];
  competent_names: string[];
  competence_note: string;
}

export interface CompanyTodo {
  kind: string;
  level: "risk" | "warn" | "info";
  label: string;
  target: string;
  count?: number;
  year?: number;
  followup_id?: number;
  can_contest?: boolean;
}

export interface CompanyDecision extends Competence {
  kind: string;
  id: number;
  label: string;
  status: string;
  outcome: "accord" | "rejet";
  motif: string | null;
  decided_at: string | null;
}

export interface CompanyAnomaly {
  type: string;
  severity: "hard" | "warning" | string;
  label: string;
  subject: string;
  detail: string;
  aac_label: string | null;
  detected_at: string | null;
}

export interface CompanySpace {
  organization: { id: number; name: string; org_type: string; profile_code: string | null } | null;
  todo: CompanyTodo[];
  decisions: CompanyDecision[];
  anomalies: CompanyAnomaly[];
  controls: (FieldControl & Partial<Competence>)[];
  acting_authority?: string;
}

export const getCompanySpace = () => getLabeled<CompanySpace>("/api/company/space", "Space");

export interface AuthorityEntry {
  code: string;
  name: string;
  mission: string;
  actions: string[];
  controls: string[];
  pending: number;
  interface: "a_venir" | "active";
  acting_authority: string;
}

export const getAuthorityCompass = () =>
  getLabeled<{ acting_authority: string; authorities: AuthorityEntry[] }>("/api/admin/authorities", "Authorities");

export interface StatementFiling {
  id: number;
  period_year: number;
  stems_felled: number | null;
  volume_m3: number | null;
  reference: string;
  filed_at: string;
  due: string;
  late: boolean;
  org_name?: string;
}

export function fileAnnualStatement(year: number): Promise<StatementFiling> {
  return postJson("/api/traceability/statements/file", { year }, "Filing");
}

export const listStatementFilings = () => getLabeled<StatementFiling[]>("/api/traceability/filings", "Filings");

async function sendJson<T>(method: string, path: string, body: unknown, label: string): Promise<T> {
  const resp = await timedFetch(`${API_BASE}${path}`, {
    method,
    headers: headers(true),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let detail = "";
    try {
      const data = await resp.json();
      detail = typeof data?.detail === "string" ? data.detail : "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `${label} ${resp.status}`);
  }
  return resp.json();
}

// ---- Slice 26: company agents, transformation register, control follow-ups ----

export interface CompanyAgent {
  id: number;
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  matricule: string | null;
  is_active: boolean;
  created_at: string;
  last_scan_at: string | null;
}

export const listMyAgents = () => getLabeled<CompanyAgent[]>("/api/organizations/me/agents", "Agents");

export const createMyAgent = (input: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  matricule?: string | null;
}) => postJson<CompanyAgent>("/api/organizations/me/agents", input, "Create agent");

export const setMyAgentActive = (id: number, isActive: boolean) =>
  sendJson<CompanyAgent>("PATCH", `/api/organizations/me/agents/${id}`, { is_active: isActive }, "Agent");

export type MillProduct = "sciage" | "placage" | "contreplaque" | "bois_profile" | "autre";

export interface MillOutput {
  id: number;
  produced_on: string;
  product_type: MillProduct;
  product_label: string;
  species_scientific_name: string | null;
  volume_m3: number;
  tree_codes: string[];
  lot_reference: string | null;
  destination: "local" | "export" | null;
  notes: string | null;
}

export interface MillRegister {
  org_id: number;
  year: number;
  inputs: {
    id: number;
    reference: string | null;
    received_at: string;
    volume_m3: number | null;
    tree_codes: string[];
    logs: number;
    from_org: string | null;
  }[];
  outputs: MillOutput[];
  stock: { tree_code: string; species_scientific_name: string | null }[];
  totals: {
    input_m3: number;
    output_m3: number;
    yield_pct: number | null;
    max_yield_pct: number;
    alert: boolean;
    logs_received: number;
    logs_in_stock: number;
  };
}

export function getMillRegister(orgId?: number | null, year?: number | null): Promise<MillRegister> {
  const params = new URLSearchParams();
  if (orgId) params.set("org_id", String(orgId));
  if (year) params.set("year", String(year));
  const q = params.toString();
  return getLabeled<MillRegister>(`/api/mill/register${q ? `?${q}` : ""}`, "Register");
}

export const recordMillOutput = (input: {
  product_type: MillProduct;
  volume_m3: number;
  tree_codes: string[];
  species_scientific_name?: string | null;
  lot_reference?: string | null;
  destination?: "local" | "export" | null;
}) => postJson<MillOutput & { transformed: string[] }>("/api/mill/outputs", input, "Mill output");

export type FollowupType = "mise_en_demeure" | "amende" | "transaction" | "saisie" | "suspension" | "poursuite";

export interface ControlFollowup extends Partial<Competence> {
  id: number;
  control_id: number;
  action_type: FollowupType;
  label: string;
  amount_fcfa: number | null;
  reference: string | null;
  due_at: string | null;
  status: "notifie" | "conteste" | "execute" | "annule";
  display_status: "notifie" | "en_retard" | "conteste" | "execute" | "annule";
  status_label: string;
  notes: string | null;
  reply: string | null;
  decision_motif: string | null;
  close_motif: string | null;
  org_id: number | null;
  org_name: string | null;
  pv_reference: string | null;
}

export const listOpenFollowups = () => getLabeled<ControlFollowup[]>("/api/controls/followups", "Followups");

export const addControlFollowup = (
  controlId: number,
  input: { action_type: FollowupType; amount_fcfa?: number | null; due_at?: string | null; reference?: string | null; notes?: string | null },
) => postJson<ControlFollowup>(`/api/controls/${controlId}/followups`, input, "Followup");

export const setFollowupStatus = (id: number, status: "execute" | "annule" | "notifie", motif?: string | null) =>
  postJson<ControlFollowup>(`/api/controls/followups/${id}/status`, { status, motif: motif ?? null }, "Followup");

export const contestFollowup = (id: number, reply: string) =>
  postJson<ControlFollowup>(`/api/controls/followups/${id}/contest`, { reply }, "Contest");

