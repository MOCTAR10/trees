import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { API_BASE } from "./api/client";

async function postJsonToPdfCache(
  path: string,
  body: unknown,
  filename: string,
): Promise<string> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`PDF ${resp.status}: ${await resp.text()}`);
  const blob = await resp.blob();
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

export async function exportReportPdf(report: unknown): Promise<string> {
  const stamp = Date.now();
  return postJsonToPdfCache("/api/v1/report/pdf", report, `rapport_${stamp}.pdf`);
}

export async function exportPlanPdf(plan: unknown): Promise<string> {
  const stamp = Date.now();
  return postJsonToPdfCache("/api/v2/report/pdf", plan, `plan_${stamp}.pdf`);
}

export async function sharePdf(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: "Document forestier",
    });
  }
}