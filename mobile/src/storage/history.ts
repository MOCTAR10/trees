import AsyncStorage from "@react-native-async-storage/async-storage";

import { V1Report, V2Response } from "../api/client";

export interface StoredScan {
  id: string;
  created_at: string;
  latitude: number;
  longitude: number;
  report: V1Report;
  valorization: V2Response | null;
}

const KEY = "forestry:scans";

export function newScanId(): string {
  return `scan_${Date.now()}`;
}

export async function loadScans(): Promise<StoredScan[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const rows = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(rows) ? (rows as StoredScan[]) : [];
  } catch {
    return [];
  }
}

async function persist(scans: StoredScan[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(scans));
}

export async function saveScan(scan: StoredScan): Promise<void> {
  const scans = await loadScans();
  scans.unshift(scan);
  await persist(scans);
}

export async function updateScanValorization(
  id: string,
  valorization: V2Response,
): Promise<void> {
  const scans = await loadScans();
  await persist(scans.map((s) => (s.id === id ? { ...s, valorization } : s)));
}

export async function deleteScan(id: string): Promise<void> {
  const scans = await loadScans();
  await persist(scans.filter((s) => s.id !== id));
}

export async function clearScans(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}