import AsyncStorage from "@react-native-async-storage/async-storage";

import { SpeciesSummary } from "../api/client";

const KEY = "forestry:species_catalog_v1";

export interface SpeciesCachePayload {
  saved_at: string;
  species: SpeciesSummary[];
}

export async function loadSpeciesCache(): Promise<SpeciesCachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpeciesCachePayload;
    if (!parsed || !Array.isArray(parsed.species)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSpeciesCache(species: SpeciesSummary[]): Promise<void> {
  const payload: SpeciesCachePayload = {
    saved_at: new Date().toISOString(),
    species,
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

export async function clearSpeciesCache(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
