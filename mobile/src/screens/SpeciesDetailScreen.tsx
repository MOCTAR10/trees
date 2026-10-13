import { ChevronLeft } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { getSpecies, SpeciesDetail } from "../api/client";
import { COUNTRY_NAMES } from "../data/countries";
import { IUCN_LABELS, IUCN_TONE } from "../data/iucn";
import { dec } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Card, EmptyState, KeyValue, Pill, Txt } from "../design/ui";

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
  const theme = useTheme();
  const s = useStyles();
  const [detail, setDetail] = React.useState<SpeciesDetail | null>(() => detailCache.get(name) ?? null);
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

  return (
    <View style={s.screen}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Retour" style={s.back} hitSlop={6}>
        <ChevronLeft size={20} color={theme.c.olive} />
        <Txt tone="olive" bold>
          Retour
        </Txt>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={s.loader} color={theme.c.olive} />
      ) : error || !detail ? (
        <EmptyState
          message={error ?? "Fiche introuvable."}
          tone="risk"
          action={{ label: "Réessayer", onPress: () => void load(true) }}
        />
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          <Card raised>
            <Txt variant="label" tone="gold">
              Fiche espèce
            </Txt>
            <Txt variant="title" style={s.sci}>
              {detail.scientific_name}
            </Txt>
            {detail.common_name_fr ? (
              <Txt variant="heading" tone="muted">
                {detail.common_name_fr}
              </Txt>
            ) : null}
            <Pill tone={IUCN_TONE[status] ?? "neutral"} label={`${status} · ${IUCN_LABELS[status] ?? status}`} />
          </Card>

          <Section title="Taxonomie">
            <KeyValue label="Famille" value={detail.family || "—"} />
            <KeyValue label="Genre" value={detail.scientific_name.split(" ")[0]} />
            <KeyValue label="Noms vernaculaires" value={detail.aliases.length ? detail.aliases.join(", ") : "—"} />
          </Section>

          <Section title="Caractéristiques">
            <KeyValue label="Densité du bois" value={`${dec(detail.wood_density_g_cm3, 2)} g/cm³`} />
            <KeyValue label="Hauteur maximale" value={`${dec(detail.max_height_m, 0)} m`} />
          </Section>

          <Section title="Croissance (Chapman-Richards)">
            <View style={s.formula}>
              <Txt variant="small" style={s.mono}>
                D(t) = {detail.cr_asymptote_a_cm} · (1 − e^(−{detail.cr_rate_k}·t))^{detail.cr_shape_p}
              </Txt>
            </View>
            <KeyValue label="Asymptote A" value={`${detail.cr_asymptote_a_cm} cm`} />
            <KeyValue label="Taux k" value={String(detail.cr_rate_k)} />
            <KeyValue label="Forme p" value={String(detail.cr_shape_p)} />
            <KeyValue label="Hauteur-diamètre" value={`H = 1.3 + ${detail.hd_a}·D / (${detail.hd_b} + D)`} />
            <KeyValue label="Source" value={detail.cr_source || "—"} />
          </Section>

          <Section title="Conservation">
            <KeyValue label="Statut IUCN" value={`${status} · ${IUCN_LABELS[status] ?? "—"}`} />
            <KeyValue label="Annexe CITES" value={detail.cites_appendix || "—"} />
            <KeyValue label="Liste UE" value={detail.eu_listing || "—"} />
            <KeyValue
              label="Originaire d'Afrique"
              value={detail.native_to_africa === null ? "—" : detail.native_to_africa ? "Oui" : "Non"}
            />
          </Section>

          <Section title="Distribution">
            <Txt>
              {detail.countries.length ? detail.countries.map((c) => COUNTRY_NAMES[c] ?? c).join(" · ") : "—"}
            </Txt>
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <Txt variant="label" tone="gold">
        {title}
      </Txt>
      {children}
    </Card>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 48,
    paddingHorizontal: th.space.md,
    alignSelf: "flex-start",
  },
  loader: { flex: 1 },
  content: { paddingHorizontal: th.space.lg, paddingBottom: th.space.xxl, gap: th.space.lg },
  sci: { fontFamily: th.fonts.bodyItalic, fontSize: 24, lineHeight: 30 },
  formula: { backgroundColor: th.c.surface2, borderRadius: th.radius.sm, padding: th.space.sm },
  mono: { fontFamily: "monospace" },
}));
