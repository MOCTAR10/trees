import React from "react";
import {
  FlatList,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { MyTree, SpeciesSummary } from "../api/client";
import FilterSheet, { FilterOption } from "../components/FilterSheet";
import RoleHeader from "../components/RoleHeader";
import SkeletonList from "../components/SkeletonList";
import SoftLoader from "../components/SoftLoader";
import { IUCN_TONE } from "../data/iucn";
import { Pill } from "../design/ui";
import {
  CatalogScope,
  EnrichedSpecies,
  ensureCatalogue,
  ensureTrees,
  refreshCatalogue,
  refreshTrees,
  useCatalogue,
} from "../storage/catalogueStore";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { normalize, sortByText } from "../utils/text";

interface Props {
  onOpenSpecies?: (species: SpeciesSummary) => void;
  onBack?: () => void;
  showHeader?: boolean;
}

type Segment = "catalogue" | "trees";
type CatalogFacet = "family" | "genus" | "country" | "continent" | "iucn";
type TreeFacet = "species" | "health" | "confidence";

function toOptions(
  counts: Record<string, number>,
  labelFor?: (value: string) => string,
): FilterOption[] {
  return Object.entries(counts).map(([value, count]) => ({
    value,
    label: labelFor ? labelFor(value) : value,
    count,
  }));
}

function confidenceBucket(c: number | null): string {
  if (c == null) return "Inconnue";
  if (c >= 0.8) return "Élevée";
  if (c >= 0.5) return "Moyenne";
  return "Faible";
}

const CATALOG_SCOPES: { key: CatalogScope; label: string }[] = [
  { key: "arbres", label: "Arbres" },
  { key: "plantes", label: "Plantes" },
  { key: "biodiversite", label: "Biodiversité" },
];

export default function SpeciesScreen({ onOpenSpecies, onBack, showHeader = false }: Props) {
  const th = useTheme();
  const styles = useStyles();
  const catalogue = useCatalogue();
  const [segment, setSegment] = React.useState<Segment>("catalogue");
  const [catalogScope, setCatalogScope] = React.useState<CatalogScope>("arbres");
  const [query, setQuery] = React.useState("");
  const [isSwitching, startSwitch] = React.useTransition();
  const deferredQuery = React.useDeferredValue(query);

  const [openFacet, setOpenFacet] = React.useState<CatalogFacet | null>(null);
  const [family, setFamily] = React.useState<string | null>(null);
  const [genus, setGenus] = React.useState<string | null>(null);
  const [country, setCountry] = React.useState<string | null>(null);
  const [continent, setContinent] = React.useState<string | null>(null);
  const [iucn, setIucn] = React.useState<string | null>(null);

  const [openTreeFacet, setOpenTreeFacet] = React.useState<TreeFacet | null>(null);
  const [treeSpecies, setTreeSpecies] = React.useState<string | null>(null);
  const [treeHealth, setTreeHealth] = React.useState<string | null>(null);
  const [treeConfidence, setTreeConfidence] = React.useState<string | null>(null);

  React.useEffect(() => {
    void ensureCatalogue();
  }, []);

  React.useEffect(() => {
    if (segment === "trees") void ensureTrees();
  }, [segment]);

  // Instant pointers into pre-partitioned memory — scope switches never
  // refetch and never re-sort: sections + facets are built once in the store.
  const scoped = catalogue.byScope[catalogScope];
  const scopeCounts = catalogue.counts;
  const preSections = catalogue.sectionsByScope[catalogScope];
  const preFacets = catalogue.facetsByScope[catalogScope];
  const facets = React.useMemo(
    () => ({
      families: preFacets.families,
      genera: preFacets.genera,
      countries: preFacets.countries,
      continents: preFacets.continents,
      iucn: preFacets.iucn,
    }),
    [preFacets],
  );

  const deferredQ = deferredQuery.trim().toLowerCase();
  const hasActiveFilters = Boolean(
    family || genus || country || continent || iucn || deferredQ,
  );

  const filtered = React.useMemo(() => {
    if (!hasActiveFilters) return scoped;
    const q = deferredQ;
    return scoped.filter((s) => {
      if (family && s.family !== family) return false;
      if (genus && s.scientific_name.split(" ")[0] !== genus) return false;
      if (country && !s.countries.includes(country)) return false;
      if (continent && !s.continents.includes(continent)) return false;
      if (iucn && (s.iucn_status ?? "NE") !== iucn) return false;
      if (!q) return true;
      return (
        s.scientific_name.toLowerCase().includes(q) ||
        (s.common_name_fr ?? "").toLowerCase().includes(q) ||
        s.aliases.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [scoped, hasActiveFilters, deferredQ, family, genus, country, continent, iucn]);

  const listRef = React.useRef<SectionList<EnrichedSpecies, { title: string }>>(null);

  // Unfiltered: reuse the store's pre-sorted sections (zero work on switch).
  // Filtered: only the small subset is sorted/grouped.
  const speciesSections = React.useMemo(() => {
    if (!hasActiveFilters) return preSections;
    const sorted = sortByText(filtered, (s) => s.scientific_name);
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
  }, [filtered, hasActiveFilters, preSections]);

  const jumpTo = (letter: string) => {
    const index = speciesSections.findIndex((s) => s.title === letter);
    if (index >= 0) {
      listRef.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, animated: true });
    }
  };

  // Only computed when the "Mes arbres" segment is visible — zero cost
  // while browsing the catalogue scopes.
  const treeFacets = React.useMemo(() => {
    if (segment !== "trees") return { species: [], health: [], confidence: [] };
    const sp: Record<string, number> = {};
    const hl: Record<string, number> = {};
    const cf: Record<string, number> = {};
    for (const t of catalogue.trees) {
      const name = t.species_scientific_name ?? "Inconnu";
      sp[name] = (sp[name] ?? 0) + 1;
      const h = t.health_status ?? "Inconnu";
      hl[h] = (hl[h] ?? 0) + 1;
      const c = confidenceBucket(t.species_confidence);
      cf[c] = (cf[c] ?? 0) + 1;
    }
    return { species: toOptions(sp), health: toOptions(hl), confidence: toOptions(cf) };
  }, [catalogue.trees, segment]);

  const filteredTrees = React.useMemo(() => {
    if (segment !== "trees") return [];
    if (!treeSpecies && !treeHealth && !treeConfidence) return catalogue.trees;
    return catalogue.trees.filter((t) => {
      if (treeSpecies && (t.species_scientific_name ?? "Inconnu") !== treeSpecies) return false;
      if (treeHealth && (t.health_status ?? "Inconnu") !== treeHealth) return false;
      if (treeConfidence && confidenceBucket(t.species_confidence) !== treeConfidence) {
        return false;
      }
      return true;
    });
  }, [catalogue.trees, treeSpecies, treeHealth, treeConfidence, segment]);

  const hasFilters = hasActiveFilters;
  const hasTreeFilters = Boolean(treeSpecies || treeHealth || treeConfidence);
  const queryPending = query.trim().toLowerCase() !== deferredQ;

  const resetFilters = React.useCallback(() => {
    setFamily(null);
    setGenus(null);
    setCountry(null);
    setContinent(null);
    setIucn(null);
    setQuery("");
    setOpenFacet(null);
  }, []);

  const selectCatalogScope = React.useCallback(
    (scope: CatalogScope) => {
      if (scope === catalogScope) return;
      // Non-urgent: input + scope chips stay interactive, list follows.
      startSwitch(() => {
        setCatalogScope(scope);
        setFamily(null);
        setGenus(null);
        setCountry(null);
        setContinent(null);
        setIucn(null);
        setQuery("");
        setOpenFacet(null);
      });
    },
    [catalogScope],
  );

  const selectSegment = React.useCallback((next: Segment) => {
    startSwitch(() => setSegment(next));
  }, []);

  // Reset scroll without animation when the scope changes — no remount.
  // Defensive: SectionList throws if the section doesn't exist yet (boot,
  // empty scope, hidden tab with no layout), which would blank the app.
  React.useEffect(() => {
    if (segment !== "catalogue") return;
    if (speciesSections.length === 0) return;
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: false });
      } catch {
        // List not laid out yet — next render will already start at top.
      }
    }, 0);
    return () => clearTimeout(t);
  }, [catalogScope, segment, speciesSections.length]);

  const syncLabel = catalogue.fromCache && !catalogue.refreshing ? "Cache local" : null;

  const openSpecies = React.useCallback(
    (item: SpeciesSummary) => onOpenSpecies?.(item),
    [onOpenSpecies],
  );

  const renderSpeciesItem = React.useCallback(
    ({ item }: { item: EnrichedSpecies }) => (
      <SpeciesRow item={item} onOpen={onOpenSpecies ? openSpecies : undefined} />
    ),
    [onOpenSpecies, openSpecies],
  );

  const renderSectionHeader = React.useCallback(
    ({ section }: { section: { title: string } }) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    [],
  );

  const toggleFacet = React.useCallback(
    (key: CatalogFacet) => setOpenFacet((cur) => (cur === key ? null : key)),
    [],
  );

  const toggleTreeFacet = React.useCallback(
    (key: TreeFacet) => setOpenTreeFacet((cur) => (cur === key ? null : key)),
    [],
  );

  const catalogFacets: Record<
    CatalogFacet,
    { title: string; options: FilterOption[]; value: string | null; set: (v: string | null) => void }
  > = {
    family: { title: "Famille", options: facets.families, value: family, set: setFamily },
    genus: { title: "Genre", options: facets.genera, value: genus, set: setGenus },
    country: { title: "Pays", options: facets.countries, value: country, set: setCountry },
    continent: { title: "Monde", options: facets.continents, value: continent, set: setContinent },
    iucn: { title: "Statut IUCN", options: facets.iucn, value: iucn, set: setIucn },
  };

  const treeFacetDefs: Record<
    TreeFacet,
    { title: string; options: FilterOption[]; value: string | null; set: (v: string | null) => void }
  > = {
    species: { title: "Espèce", options: treeFacets.species, value: treeSpecies, set: setTreeSpecies },
    health: { title: "État sanitaire", options: treeFacets.health, value: treeHealth, set: setTreeHealth },
    confidence: {
      title: "Confiance",
      options: treeFacets.confidence,
      value: treeConfidence,
      set: setTreeConfidence,
    },
  };

  return (
    <View style={styles.container}>
      {showHeader && <RoleHeader title="Espèce" subtitle="Catalogue des espèces référencées" />}
      {onBack && !showHeader && (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.link}>← Retour</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.segmentBar}>
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segBtn, segment === "catalogue" && styles.segBtnOn]}
            onPress={() => selectSegment("catalogue")}
            accessibilityRole="button"
            accessibilityState={{ selected: segment === "catalogue" }}
          >
            <Text style={[styles.segText, segment === "catalogue" && styles.segTextOn]}>
              Catalogue ({catalogue.species.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, segment === "trees" && styles.segBtnOn]}
            onPress={() => selectSegment("trees")}
            accessibilityRole="button"
            accessibilityState={{ selected: segment === "trees" }}
          >
            <Text style={[styles.segText, segment === "trees" && styles.segTextOn]}>
              Mes arbres ({catalogue.trees.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {segment === "catalogue" ? (
        <>
          <View style={styles.scopeBar}>
            <View style={styles.segment}>
              {CATALOG_SCOPES.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.segBtn,
                    catalogScope === key && styles.segBtnOn,
                    isSwitching && catalogScope !== key && styles.segBtnDim,
                  ]}
                  onPress={() => selectCatalogScope(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: catalogScope === key }}
                >
                  <Text style={[styles.segText, catalogScope === key && styles.segTextOn]}>
                    {label} ({scopeCounts[key]})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.searchBar}>
            {!catalogue.booting && (
              <View style={styles.statsRow}>
                <Text style={styles.stats}>
                  {syncLabel
                    ? `${syncLabel} · ${filtered.length} espèces`
                    : `${filtered.length} / ${scoped.length} espèces`}
                  {queryPending || isSwitching ? " …" : ""}
                </Text>
                {hasFilters ? (
                  <TouchableOpacity onPress={resetFilters}>
                    <Text style={styles.resetLink}>Réinitialiser</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    disabled={catalogue.refreshing}
                    onPress={() => void refreshCatalogue()}
                  >
                    <Text style={[styles.resetLink, catalogue.refreshing && styles.resetDim]}>
                      Actualiser
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher (nom scientifique ou commun)"
              placeholderTextColor={th.c.muted}
              style={styles.input}
            />
            <View style={styles.filterRow}>
              {(Object.keys(catalogFacets) as CatalogFacet[]).map((key) => {
                const f = catalogFacets[key];
                return (
                  <FilterButton
                    key={key}
                    label={f.title}
                    count={f.options.length}
                    value={f.value}
                    open={openFacet === key}
                    onPress={() => toggleFacet(key)}
                    onClear={() => f.set(null)}
                  />
                );
              })}
            </View>
          </View>

          {catalogue.booting ? (
            <SkeletonList rows={8} />
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.meta}>
                {hasFilters ? "Aucune espèce ne correspond aux filtres." : "Aucune espèce disponible."}
              </Text>
              {hasFilters && (
                <TouchableOpacity onPress={resetFilters}>
                  <Text style={styles.link}>Réinitialiser les filtres</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.listWrap}>
              <SectionList
                ref={listRef}
                sections={speciesSections}
                keyExtractor={(s) => s.scientific_name}
                style={styles.listFlex}
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={18}
                maxToRenderPerBatch={20}
                updateCellsBatchingPeriod={50}
                windowSize={5}
                removeClippedSubviews
                stickySectionHeadersEnabled={false}
                renderSectionHeader={renderSectionHeader}
                renderItem={renderSpeciesItem}
              />
              <View style={styles.rail}>
                {speciesSections.map((s) => (
                  <TouchableOpacity key={s.title} onPress={() => jumpTo(s.title)}>
                    <Text style={styles.railLetter}>{s.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <FilterSheet
            visible={openFacet !== null}
            title={openFacet ? catalogFacets[openFacet].title : ""}
            options={openFacet ? catalogFacets[openFacet].options : []}
            selected={openFacet ? catalogFacets[openFacet].value : null}
            onSelect={(v) => openFacet && catalogFacets[openFacet].set(v)}
            onClose={() => setOpenFacet(null)}
          />
        </>
      ) : (
        <>
          <View style={styles.searchBar}>
            {hasTreeFilters && (
              <View style={styles.statsRow}>
                <Text style={styles.stats}>
                  {filteredTrees.length} / {catalogue.trees.length} arbres
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setTreeSpecies(null);
                    setTreeHealth(null);
                    setTreeConfidence(null);
                    setOpenTreeFacet(null);
                  }}
                >
                  <Text style={styles.resetLink}>Réinitialiser</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.filterRow}>
              {(Object.keys(treeFacetDefs) as TreeFacet[]).map((key) => {
                const f = treeFacetDefs[key];
                return (
                  <FilterButton
                    key={key}
                    label={f.title}
                    count={f.options.length}
                    value={f.value}
                    open={openTreeFacet === key}
                    onPress={() => toggleTreeFacet(key)}
                    onClear={() => f.set(null)}
                  />
                );
              })}
            </View>
          </View>

          {catalogue.treesLoading && !catalogue.treesReady ? (
            <SoftLoader variant="full" message="Chargement de vos arbres…" />
          ) : filteredTrees.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.meta}>
                {hasTreeFilters
                  ? "Aucun arbre ne correspond aux filtres."
                  : "Aucun arbre analysé pour l'instant."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredTrees}
              refreshing={catalogue.treesLoading}
              onRefresh={() => void refreshTrees()}
              keyExtractor={(t: MyTree) => String(t.id)}
              contentContainerStyle={styles.list}
              initialNumToRender={12}
              windowSize={7}
              removeClippedSubviews
              renderItem={({ item }) => {
                const speciesName = item.species_scientific_name ?? "Inconnu";
                const when = new Date(item.created_at).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <View style={styles.row}>
                    <Text style={styles.scientific}>{speciesName}</Text>
                    <Text style={styles.meta}>
                      DBH {item.measured_dbh_cm ?? "—"} cm · H {item.estimated_height_m ?? "—"} m · Âge{" "}
                      {item.estimated_age_years ?? "—"} a · conf{" "}
                      {(item.species_confidence ?? 0).toFixed(2)}
                    </Text>
                    <Text style={styles.meta}>
                      {when} · {item.latitude?.toFixed(4)}, {item.longitude?.toFixed(4)}
                    </Text>
                    {item.health_status && <Text style={styles.health}>{item.health_status}</Text>}
                  </View>
                );
              }}
            />
          )}

          <FilterSheet
            visible={openTreeFacet !== null}
            title={openTreeFacet ? treeFacetDefs[openTreeFacet].title : ""}
            options={openTreeFacet ? treeFacetDefs[openTreeFacet].options : []}
            selected={openTreeFacet ? treeFacetDefs[openTreeFacet].value : null}
            onSelect={(v) => openTreeFacet && treeFacetDefs[openTreeFacet].set(v)}
            onClose={() => setOpenTreeFacet(null)}
          />
        </>
      )}
    </View>
  );
}

const SpeciesRow = React.memo(function SpeciesRow({
  item,
  onOpen,
}: {
  item: EnrichedSpecies;
  onOpen?: (species: SpeciesSummary) => void;
}) {
  const th = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity style={styles.row} disabled={!onOpen} onPress={() => onOpen?.(item)}>
      <View style={styles.rowHeader}>
        <Text style={styles.scientific} numberOfLines={1}>
          {item.scientific_name}
        </Text>
        <Pill tone={IUCN_TONE[item.iucn_status ?? ""] ?? "neutral"} label={item.iucn_status ?? "NE"} />
      </View>
      <Text style={styles.common}>{item.common_name_fr ?? "—"}</Text>
      <Text style={styles.meta}>
        {item.family ? `${item.family} · ` : ""}
        {item.wood_density_g_cm3 ? `${item.wood_density_g_cm3.toFixed(2)} g/cm³ · ` : ""}
        {item.countries.length} pays
      </Text>
    </TouchableOpacity>
  );
});

const FilterButton = React.memo(function FilterButton({
  label,
  count,
  value,
  open,
  onPress,
  onClear,
}: {
  label: string;
  count: number;
  value: string | null;
  open: boolean;
  onPress: () => void;
  onClear: () => void;
}) {
  const th = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.filterBtn, (value || open) && styles.filterBtnActive]}>
      <TouchableOpacity
        style={styles.filterBtnMain}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.filterBtnText, value && styles.filterBtnValue]}>
          {value ?? `${label} (${count})`}
        </Text>
        <Text style={styles.filterChevron}>{open ? "▴" : "▾"}</Text>
      </TouchableOpacity>
      {value ? (
        <TouchableOpacity
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Effacer ${label}`}
        >
          <Text style={styles.filterClear}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  topBar: { padding: th.space.lg, borderBottomWidth: 1, borderBottomColor: th.c.line },
  link: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  segmentBar: { padding: th.space.lg, paddingBottom: 0 },
  scopeBar: { paddingHorizontal: th.space.lg, paddingTop: th.space.sm },
  segment: {
    flexDirection: "row",
    backgroundColor: th.c.surface2,
    borderRadius: th.radius.md,
    padding: 3,
    gap: 3,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    borderRadius: th.radius.sm + 2,
  },
  segBtnOn: { backgroundColor: th.c.surface, borderWidth: 1, borderColor: th.c.line },
  segBtnDim: { opacity: 0.6 },
  segText: { color: th.c.muted, fontSize: 13.5, fontFamily: th.fonts.body },
  segTextOn: { color: th.c.olive, fontFamily: th.fonts.bodyBold },
  searchBar: { padding: th.space.lg, gap: th.space.sm },
  input: {
    minHeight: 48,
    backgroundColor: th.c.surface,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    color: th.c.ink,
    fontSize: 15,
    fontFamily: th.fonts.body,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stats: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  resetLink: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold },
  resetDim: { opacity: 0.45 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: th.space.lg,
    minHeight: 40,
    borderRadius: th.radius.pill,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
  },
  filterBtnMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.xs,
  },
  filterBtnActive: { borderColor: th.c.olive, backgroundColor: th.c.oliveSoft },
  filterBtnText: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, flexShrink: 1 },
  filterBtnValue: { color: th.c.olive, fontFamily: th.fonts.bodyBold },
  filterChevron: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  filterClear: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold, marginLeft: th.space.sm },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: th.space.xl,
    gap: th.space.sm,
  },
  list: { padding: th.space.lg, gap: th.space.sm },
  listWrap: { flex: 1, flexDirection: "row" },
  listFlex: { flex: 1 },
  sectionHeader: {
    color: th.c.goldInk,
    fontSize: 13,
    fontFamily: th.fonts.display,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingTop: th.space.sm,
    paddingBottom: th.space.xs,
    backgroundColor: th.c.bg,
  },
  rail: { width: 26, alignItems: "center", justifyContent: "center", paddingVertical: th.space.sm },
  railLetter: { color: th.c.olive, fontSize: 11, fontFamily: th.fonts.displaySemi, paddingVertical: 1 },
  row: {
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: th.space.sm,
  },
  scientific: {
    color: th.c.ink,
    fontSize: 15,
    fontFamily: th.fonts.bodyItalic,
    flexShrink: 1,
  },
  common: { color: th.c.ink, fontSize: 16, fontFamily: th.fonts.bodyBold },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  health: { color: th.c.warn, fontSize: 12, fontFamily: th.fonts.bodyBold },
}));
