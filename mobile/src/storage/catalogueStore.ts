import { AppState, AppStateStatus } from "react-native";
import { useSyncExternalStore } from "react";

import {
  isGatewayReachable,
  listMyTrees,
  listSpecies,
  MyTree,
  SpeciesSummary,
} from "../api/client";
import { CONTINENT_BY_COUNTRY, COUNTRY_NAMES } from "../data/countries";
import { IUCN_LABELS } from "../data/iucn";
import { normalize } from "../utils/text";
import { loadSpeciesCache, saveSpeciesCache } from "./speciesCache";

export type CatalogScope = "arbres" | "plantes" | "biodiversite";

export type EnrichedSpecies = SpeciesSummary & { continents: string[] };

export type SpeciesSection = { title: string; data: EnrichedSpecies[] };

export type FacetOption = { value: string; label: string; count: number };

export type ScopeFacets = {
  families: FacetOption[];
  genera: FacetOption[];
  countries: FacetOption[];
  continents: FacetOption[];
  iucn: FacetOption[];
};

export interface CatalogueState {
  species: EnrichedSpecies[];
  byScope: Record<CatalogScope, EnrichedSpecies[]>;
  sectionsByScope: Record<CatalogScope, SpeciesSection[]>;
  facetsByScope: Record<CatalogScope, ScopeFacets>;
  counts: Record<CatalogScope, number>;
  trees: MyTree[];
  /** True only on first cold start with nothing in memory yet. */
  booting: boolean;
  /** Silent network refresh — never blocks the UI. */
  refreshing: boolean;
  fromCache: boolean;
  treesReady: boolean;
  treesLoading: boolean;
  lastSyncedAt: string | null;
}

const SCOPES: CatalogScope[] = ["arbres", "plantes", "biodiversite"];

const EMPTY_FACETS: ScopeFacets = {
  families: [],
  genera: [],
  countries: [],
  continents: [],
  iucn: [],
};

const EMPTY_SCOPE: Record<CatalogScope, EnrichedSpecies[]> = {
  arbres: [],
  plantes: [],
  biodiversite: [],
};

const EMPTY_SECTIONS: Record<CatalogScope, SpeciesSection[]> = {
  arbres: [],
  plantes: [],
  biodiversite: [],
};

const EMPTY_FACETS_BY_SCOPE: Record<CatalogScope, ScopeFacets> = {
  arbres: EMPTY_FACETS,
  plantes: EMPTY_FACETS,
  biodiversite: EMPTY_FACETS,
};

const EMPTY_COUNTS: Record<CatalogScope, number> = {
  arbres: 0,
  plantes: 0,
  biodiversite: 0,
};

let state: CatalogueState = {
  species: [],
  byScope: EMPTY_SCOPE,
  sectionsByScope: EMPTY_SECTIONS,
  facetsByScope: EMPTY_FACETS_BY_SCOPE,
  counts: EMPTY_COUNTS,
  trees: [],
  booting: true,
  refreshing: false,
  fromCache: false,
  treesReady: false,
  treesLoading: false,
  lastSyncedAt: null,
};

const listeners = new Set<() => void>();
let speciesInflight: Promise<void> | null = null;
let treesInflight: Promise<void> | null = null;
let appStateBound = false;
let memoryWarm = false;

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<CatalogueState>) {
  state = { ...state, ...patch };
  emit();
}

function toOptions(
  counts: Record<string, number>,
  labelFor?: (value: string) => string,
): FacetOption[] {
  return Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0], "fr"))
    .map(([value, count]) => ({
      value,
      label: labelFor ? labelFor(value) : value,
      count,
    }));
}

export function buildSections(list: EnrichedSpecies[]): SpeciesSection[] {
  const sorted = [...list].sort((a, b) => a.scientific_name.localeCompare(b.scientific_name, "fr"));
  const groups: Record<string, EnrichedSpecies[]> = {};
  for (const s of sorted) {
    const first = normalize(s.scientific_name).charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : "#";
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(s);
  }
  return Object.keys(groups)
    .sort()
    .map((title) => ({ title, data: groups[title] }));
}

function buildFacets(list: EnrichedSpecies[]): ScopeFacets {
  const fam: Record<string, number> = {};
  const gen: Record<string, number> = {};
  const cty: Record<string, number> = {};
  const con: Record<string, number> = {};
  const iuc: Record<string, number> = {};
  for (const s of list) {
    if (s.family) fam[s.family] = (fam[s.family] ?? 0) + 1;
    const g = s.scientific_name.split(" ")[0];
    if (g) gen[g] = (gen[g] ?? 0) + 1;
    for (const c of s.countries) {
      if (c === "ZZ") continue;
      cty[c] = (cty[c] ?? 0) + 1;
    }
    for (const c of s.continents) con[c] = (con[c] ?? 0) + 1;
    const status = s.iucn_status ?? "NE";
    iuc[status] = (iuc[status] ?? 0) + 1;
  }
  return {
    families: toOptions(fam),
    genera: toOptions(gen),
    countries: toOptions(cty, (v) => COUNTRY_NAMES[v] ?? v),
    continents: toOptions(con),
    iucn: toOptions(iuc, (v) => IUCN_LABELS[v] ?? v),
  };
}

function enrich(list: SpeciesSummary[]): Pick<
  CatalogueState,
  "species" | "byScope" | "sectionsByScope" | "facetsByScope" | "counts"
> {
  const species: EnrichedSpecies[] = list.map((s) => ({
    ...s,
    continents: [...new Set(s.countries.map((c) => CONTINENT_BY_COUNTRY[c] ?? "Autre"))].filter(
      (c) => c !== "Autre",
    ),
  }));
  const byScope: Record<CatalogScope, EnrichedSpecies[]> = {
    arbres: [],
    plantes: [],
    biodiversite: [],
  };
  for (const s of species) {
    if (s.type === "arbre") byScope.arbres.push(s);
    else if (s.type === "plante") byScope.plantes.push(s);
    else byScope.biodiversite.push(s);
  }

  const sectionsByScope = {} as Record<CatalogScope, SpeciesSection[]>;
  const facetsByScope = {} as Record<CatalogScope, ScopeFacets>;
  for (const scope of SCOPES) {
    sectionsByScope[scope] = buildSections(byScope[scope]);
    facetsByScope[scope] = buildFacets(byScope[scope]);
  }

  return {
    species,
    byScope,
    sectionsByScope,
    facetsByScope,
    counts: {
      arbres: byScope.arbres.length,
      plantes: byScope.plantes.length,
      biodiversite: byScope.biodiversite.length,
    },
  };
}

function applySpecies(list: SpeciesSummary[], fromCache: boolean) {
  const built = enrich(list);
  memoryWarm = list.length > 0;
  setState({
    ...built,
    fromCache,
    booting: false,
    lastSyncedAt: fromCache ? state.lastSyncedAt : new Date().toISOString(),
  });
}

async function fetchSpeciesNetwork(): Promise<void> {
  if (isGatewayReachable() === false) {
    // Offline: serve cache only instead of burning a full timeout.
    if (!memoryWarm) setState({ booting: false });
    return;
  }
  setState({ refreshing: true });
  try {
    const res = await listSpecies();
    applySpecies(res.species, false);
    await saveSpeciesCache(res.species);
  } catch (err) {
    console.error("catalogue refresh failed", err);
    if (!memoryWarm) setState({ booting: false });
  } finally {
    setState({ refreshing: false });
  }
}

/** Hydrate once from memory → disk → network. Safe to call on every screen focus. */
export async function ensureCatalogue(opts?: { force?: boolean }): Promise<void> {
  if (memoryWarm && !opts?.force) {
    if (!state.refreshing && !state.lastSyncedAt) {
      speciesInflight ??= fetchSpeciesNetwork().finally(() => {
        speciesInflight = null;
      });
    }
    return;
  }

  if (speciesInflight) return speciesInflight;

  speciesInflight = (async () => {
    if (!memoryWarm) {
      const cached = await loadSpeciesCache();
      if (cached?.species?.length) {
        applySpecies(cached.species, true);
      } else {
        setState({ booting: true });
      }
    }
    await fetchSpeciesNetwork();
  })().finally(() => {
    speciesInflight = null;
  });

  return speciesInflight;
}

export async function ensureTrees(opts?: { force?: boolean }): Promise<void> {
  if (state.treesReady && !opts?.force) return;
  if (treesInflight) return treesInflight;
  if (isGatewayReachable() === false && !state.treesReady) {
    setState({ treesLoading: false });
    return;
  }

  treesInflight = (async () => {
    setState({ treesLoading: !state.treesReady });
    try {
      const trees = await listMyTrees(200);
      setState({ trees, treesReady: true });
    } catch (err) {
      console.error("trees refresh failed", err);
    } finally {
      setState({ treesLoading: false });
      treesInflight = null;
    }
  })();

  return treesInflight;
}

export function refreshCatalogue(): Promise<void> {
  return ensureCatalogue({ force: true });
}

export function refreshTrees(): Promise<void> {
  return ensureTrees({ force: true });
}

/** Minimum quiet period between silent foreground refreshes. */
export const FOREGROUND_REFRESH_MIN_MS = 15 * 60 * 1000;

export function shouldForegroundRefresh(
  warm: boolean,
  lastSyncedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!warm) return false;
  if (!lastSyncedAt) return true;
  const t = Date.parse(lastSyncedAt);
  if (Number.isNaN(t)) return true;
  return now - t >= FOREGROUND_REFRESH_MIN_MS;
}

function onAppState(next: AppStateStatus) {
  // No unconditional refresh: returning from the camera/gallery fires
  // `active` every time, and a full re-sort on each return froze the UI.
  if (next === "active" && shouldForegroundRefresh(memoryWarm, state.lastSyncedAt)) {
    void ensureCatalogue({ force: true });
  }
}

/** Bind once — silent refresh when returning to the app. */
export function bindCatalogueLifecycle(): () => void {
  if (appStateBound) return () => undefined;
  appStateBound = true;
  const sub = AppState.addEventListener("change", onAppState);
  void ensureCatalogue();
  return () => {
    sub.remove();
    appStateBound = false;
  };
}

export function getCatalogueSnapshot(): CatalogueState {
  return state;
}

export function subscribeCatalogue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCatalogue(): CatalogueState {
  return useSyncExternalStore(subscribeCatalogue, getCatalogueSnapshot, getCatalogueSnapshot);
}
