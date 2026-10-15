import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { API_BASE, requestHeaders, timedFetch, UPLOAD_TIMEOUT_MS } from "./api/client";

const API_KEY = process.env.EXPO_PUBLIC_API_KEY;
const authHeaders = API_KEY ? { "X-API-Key": API_KEY } : undefined;

/** Web: object URL → file name, used when the browser downloads the PDF. */
const webFileNames = new Map<string, string>();

async function blobToCache(blob: Blob, filename: string): Promise<string> {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(blob);
    webFileNames.set(url, filename);
    return url;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Échec de lecture du PDF"));
    reader.readAsDataURL(blob);
  });
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(dest, dataUrl.split(",")[1], {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

async function postJsonToPdfCache(
  path: string,
  body: unknown,
  filename: string,
): Promise<string> {
  const resp = await timedFetch(
    `${API_BASE}${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(body),
    },
    UPLOAD_TIMEOUT_MS,
  );
  if (!resp.ok) throw new Error(`PDF ${resp.status}: ${await resp.text()}`);
  return blobToCache(await resp.blob(), filename);
}

/** GET an authenticated PDF endpoint and cache it locally. */
async function getPdfToCache(path: string, filename: string): Promise<string> {
  const resp = await timedFetch(
    `${API_BASE}${path}`,
    { headers: requestHeaders() },
    UPLOAD_TIMEOUT_MS,
  );
  if (!resp.ok) throw new Error(`PDF ${resp.status}: ${await resp.text()}`);
  return blobToCache(await resp.blob(), filename);
}

export async function exportReportPdf(report: unknown): Promise<string> {
  const stamp = Date.now();
  return postJsonToPdfCache("/api/v1/report/pdf", report, `rapport_${stamp}.pdf`);
}

export async function exportPlanPdf(plan: unknown): Promise<string> {
  const stamp = Date.now();
  return postJsonToPdfCache("/api/v2/report/pdf", plan, `plan_${stamp}.pdf`);
}

/** Carnet de chantier (DF10) PDF for the caller's scope. */
export async function exportDf10Pdf(): Promise<string> {
  return getPdfToCache("/api/traceability/df10/pdf", `carnet_df10_${Date.now()}.pdf`);
}

/** Periodic statement (état trimestriel/annuel) PDF. */
export async function exportStatementPdf(year: number, quarter?: number | null): Promise<string> {
  const qs = new URLSearchParams({ year: String(year) });
  if (quarter) qs.set("quarter", String(quarter));
  const label = `etat_${year}${quarter ? `_T${quarter}` : ""}`;
  return getPdfToCache(`/api/traceability/statements/pdf?${qs.toString()}`, `${label}.pdf`);
}

/** Transport document (bordereau / feuille de route / spécification) PDF. */
export async function exportTransportPdf(id: number): Promise<string> {
  return getPdfToCache(`/api/transport/documents/${id}/pdf`, `transport_${id}.pdf`);
}

/** Field-control procès-verbal (template to be validated by the Ministry). */
export async function exportControlPdf(id: number, reference?: string | null): Promise<string> {
  const name = (reference ?? `controle_${id}`).replace(/[^A-Za-z0-9_-]/g, "-");
  return getPdfToCache(`/api/controls/${id}/pdf`, `PV_${name}.pdf`);
}

/** Transformation register of a mill (the caller's, or an organisation's for the Ministry). */
export async function exportMillRegisterPdf(orgId?: number | null, year?: number | null): Promise<string> {
  const qs = new URLSearchParams();
  if (orgId) qs.set("org_id", String(orgId));
  if (year) qs.set("year", String(year));
  const q = qs.toString();
  return getPdfToCache(`/api/mill/register/pdf${q ? `?${q}` : ""}`, `registre_transformation_${year ?? Date.now()}.pdf`);
}

/** EUDR due-diligence statement PDF. */
export async function exportDiligencePdf(id: number): Promise<string> {
  return getPdfToCache(`/api/eudr/diligence/${id}/pdf`, `diligence_eudr_${id}.pdf`);
}

/** Harvest authorization (assiette / PAO / vente de coupe / CAE) PDF. */
export async function exportAuthorizationPdf(id: number): Promise<string> {
  return getPdfToCache(`/api/titles/authorizations/${id}/pdf`, `autorisation_${id}.pdf`);
}

/** Title convention (provisoire / définitive) + attestation PDF. */
export async function exportConventionPdf(titleId: number, conventionId: number): Promise<string> {
  return getPdfToCache(
    `/api/titles/${titleId}/conventions/${conventionId}/pdf`,
    `convention_${conventionId}.pdf`,
  );
}

/** Environmental study (PPF / EIE) + certificat de conformité PDF. */
export async function exportStudyPdf(titleId: number, studyId: number): Promise<string> {
  return getPdfToCache(`/api/titles/${titleId}/studies/${studyId}/pdf`, `etude_${studyId}.pdf`);
}

/** Third-party certification (FSC / PAFC / …) PDF. */
export async function exportCertificationPdf(id: number): Promise<string> {
  return getPdfToCache(`/api/certifications/${id}/pdf`, `certification_${id}.pdf`);
}

/** Ministry anomaly register PDF. */
export async function exportAnomaliesPdf(): Promise<string> {
  return getPdfToCache("/api/anomalies/pdf", `anomalies_${Date.now()}.pdf`);
}

/** Ministry dashboard rollup PDF. */
export async function exportDashboardPdf(): Promise<string> {
  return getPdfToCache("/api/dashboard/pdf", `tableau_de_bord_${Date.now()}.pdf`);
}

/** QR plates of a declaration's stems (print at 100 % or engrave in-house). */
export async function exportDeclarationPlatesPdf(declarationId: number): Promise<string> {
  return getPdfToCache(
    `/api/felling/declarations/${declarationId}/plates.pdf`,
    `plaques_declaration_${declarationId}.pdf`,
  );
}

export async function sharePdf(uri: string): Promise<void> {
  if (Platform.OS === "web") {
    const link = document.createElement("a");
    link.href = uri;
    link.download = webFileNames.get(uri) ?? "document.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(uri);
      webFileNames.delete(uri);
    }, 60_000);
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: "Document forestier",
    });
  }
}