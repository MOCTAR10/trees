import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getSpecies, SpeciesDetail } from "../api/client";
import { COUNTRY_NAMES } from "../data/countries";
import { IUCN_COLORS, IUCN_LABELS } from "../data/iucn";
import { colors, spacing, type } from "../theme";

interface Props {
  name: string;
  onBack: () => void;
}

// In-memory detail cache: back/forth navigation is instant, network only
// on first open (or explicit retry). Cap size to avoid unbounded growth.
const detailCache = new Map<string, SpeciesDetail>();
const DETAIL_CACHE_MAX = 50;

function cacheDetail(name: string, detail: SpeciesDetail) {
  if (detailCache.has(name)) detailCache.delete(name);
  detailCache.set(name, detail);
  while (detailCache.size > DETAIL_CACHE_MAX) {
    const oldest = detailCache.keys().next().value;
    if (oldest === undefined) break;
    detailCache.delete(oldest);
  }
}

export default function SpeciesDetailScreen({ name, onBack }: Props) {
  const [detail, setDetail] = React.useState<SpeciesDetail | null>(
    () => detailCache.get(name) ?? null,
  );
  const [loading, setLoading] = React.useState(() => !detailCache.has(name));
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (force = false) => {
      if (!force && detailCache.has(name)) {
        setDetail(detailCache.get(name) ?? null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const fresh = await getSpecies(name);
        cacheDetail(name, fresh);
        setDetail(fresh);
      } catch (err) {
        console.error("species detail failed", err);
        setError("Chargement de la fiche impossible.");
      } finally {
        setLoading(false);
      }
    },
    [name],
  );

  React.useEffect(() => {
    const cached = detailCache.get(name);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      return;
    }
    void load();
  }, [name, load]);

  const status = detail?.iucn_status || "NE";
  const iucnColor = IUCN_COLORS[status] ?? colors.textDim;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} />
      ) : error || !detail ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? "Fiche introuvable."}</Text>
          <TouchableOpacity onPress={() => void load(true)}>
            <Text style={styles.link}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.scientific}>{detail.scientific_name}</Text>
            {detail.common_name_fr ? (
              <Text style={styles.common}>{detail.common_name_fr}</Text>
            ) : null}
            <View style={[styles.iucnBadge, { backgroundColor: iucnColor }]}>
              <Text style={styles.iucnText}>
                {status} · {IUCN_LABELS[status] ?? status}
              </Text>
            </View>
          </View>

          <Section title="Taxonomie">
            <Row label="Famille" value={detail.family || "—"} />
            <Row label="Genre" value={detail.scientific_name.split(" ")[0]} />
            <Row
              label="Noms vernaculaires"
              value={detail.aliases.length ? detail.aliases.join(", ") : "—"}
            />
          </Section>

          <Section title="Caractéristiques">
            <Row label="Densité du bois" value={`${detail.wood_density_g_cm3.toFixed(2)} g/cm³`} />
            <Row label="Hauteur maximale" value={`${detail.max_height_m.toFixed(0)} m`} />
          </Section>

          <Section title="Croissance (Chapman-Richards)">
            <Text style={styles.formula}>
              D(t) = {detail.cr_asymptote_a_cm} · (1 − e^(−{detail.cr_rate_k}·t))^{detail.cr_shape_p}
            </Text>
            <Row label="Asymptote A" value={`${detail.cr_asymptote_a_cm} cm`} />
            <Row label="Taux k" value={String(detail.cr_rate_k)} />
            <Row label="Forme p" value={String(detail.cr_shape_p)} />
            <Row
              label="Hauteur-diamètre"
              value={`H = 1.3 + ${detail.hd_a}·D / (${detail.hd_b} + D)`}
            />
            <Row label="Source" value={detail.cr_source || "—"} />
          </Section>

          <Section title="Conservation">
            <Row
              label="Statut IUCN"
              value={`${status} · ${IUCN_LABELS[status] ?? "—"}`}
            />
            <Row label="Annexe CITES" value={detail.cites_appendix || "—"} />
            <Row label="Liste UE" value={detail.eu_listing || "—"} />
            <Row
              label="Originaire d'Afrique"
              value={
                detail.native_to_africa === null
                  ? "—"
                  : detail.native_to_africa
                    ? "Oui"
                    : "Non"
              }
            />
          </Section>

          <Section title="Distribution">
            <Text style={styles.chips}>
              {detail.countries.length
                ? detail.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(" · ")
                : "—"}
            </Text>
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700", marginTop: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  error: { color: colors.error, fontSize: type.body },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  header: { gap: spacing.xs },
  scientific: { color: colors.text, fontSize: type.title, fontWeight: "800", fontStyle: "italic" },
  common: { color: colors.textDim, fontSize: type.heading },
  iucnBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  iucnText: { color: colors.text, fontSize: type.body, fontWeight: "800" },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.accent,
    fontSize: type.caption,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  formula: {
    color: colors.text,
    fontSize: type.body,
    fontStyle: "italic",
    fontFamily: "monospace",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  rowLabel: { color: colors.textDim, fontSize: type.body, flexShrink: 0 },
  rowValue: { color: colors.text, fontSize: type.body, fontWeight: "600", flex: 1, textAlign: "right" },
  chips: { color: colors.text, fontSize: type.body, lineHeight: 22 },
});
