import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import { CapturedImage, processScanV1, processScanV2, V1Report, V2Response } from "../api/client";

export interface QueuedV1Scan {
  kind: "v1";
  id: string;
  scan_id: string;
  created_at: string;
  latitude: number;
  longitude: number;
  ar_depth_m: number;
  images: { trunk: CapturedImage; leaf: CapturedImage; habitat: CapturedImage };
}

export interface QueuedV2Scan {
  kind: "v2";
  id: string;
  scan_id: string | null;
  created_at: string;
  payload: {
    species_scientific_name: string;
    measured_dbh_cm: number;
    latitude: number;
    longitude: number;
    canopy_density_fcd?: number;
  };
}

export type QueuedScan = QueuedV1Scan | QueuedV2Scan;

const KEY = "forestry:queue";

const OUTBOX = `${FileSystem.documentDirectory}outbox/`;

async function persist(queue: QueuedScan[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

export async function loadQueue(): Promise<QueuedScan[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const rows = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(rows) ? (rows as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

export async function enqueue(scan: QueuedScan): Promise<void> {
  const queue = await loadQueue();
  queue.push(scan);
  await persist(queue);
}

export async function removeQueued(id: string): Promise<void> {
  const queue = await loadQueue();
  await persist(queue.filter((s) => s.id !== id));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/**
 * Copy a captured photo to persistent storage so it survives cache eviction
 * (the camera writes JPEGs to the OS cache directory).
 */
export async function copyToOutbox(uri: string, name: string): Promise<CapturedImage> {
  try {
    await FileSystem.makeDirectoryAsync(OUTBOX, { intermediates: true });
  } catch {
    // directory already exists
  }
  const dest = `${OUTBOX}${Date.now()}_${name}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return { uri: dest, name, type: "image/jpeg" };
}

export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    err instanceof TypeError ||
    /network request failed|failed to fetch|fetch failed|socket|connect|ECONN/i.test(msg)
  );
}

export interface FlushHandlers {
  onV1Success: (entry: QueuedV1Scan, report: V1Report) => Promise<void>;
  onV2Success: (entry: QueuedV2Scan, report: V2Response) => Promise<void>;
}

/**
 * Attempt every queued item once. Successful items are removed from the queue.
 * A non-network failure keeps the item (retried on the next flush); an offline
 * error stops the loop to avoid burning attempts repeatedly.
 */
export async function flushQueue(
  handlers: FlushHandlers,
): Promise<{ synced: number; failed: number }> {
  const queue = await loadQueue();
  let synced = 0;
  for (const item of queue) {
    try {
      if (item.kind === "v1") {
        const report = await processScanV1({
          trunk: item.images.trunk,
          leaf: item.images.leaf,
          habitat: item.images.habitat,
          latitude: item.latitude,
          longitude: item.longitude,
          arDepthM: item.ar_depth_m,
        });
        await handlers.onV1Success(item, report);
      } else {
        const v2 = await processScanV2(item.payload);
        await handlers.onV2Success(item, v2);
      }
      await removeQueued(item.id);
      synced += 1;
    } catch (err) {
      if (isNetworkError(err)) break;
    }
  }
  return { synced, failed: queue.length - synced };
}