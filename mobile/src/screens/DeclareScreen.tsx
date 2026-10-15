import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  createDeclaration,
  DeclarationCreated,
  DeclarationLineInput,
  FellingAacOption,
  listFellingAacOptions,
  MarkingType,
  PermitType,
} from "../api/client";
import { fr } from "../i18n/fr";
import { colors, spacing, type } from "../theme";

const t = fr.felling;

const PERMIT_TYPES: PermitType[] = ["CFAD", "PFA", "PGG", "ASC", "ACBSL", "foret_communautaire"];
const MARKINGS: MarkingType[] = ["qr", "peinture", "gps_photo"];

interface Props {
  onDone: () => void;
  onBack: () => void;
}

interface LineDraft extends DeclarationLineInput {
  key: string;
}

let lineSeq = 0;
function newLine(): LineDraft {
  lineSeq += 1;
  return { key: `line-${lineSeq}`, tree_code: "", marking_type: "gps_photo" };
}

export default function DeclareScreen({ onDone, onBack }: Props) {
  const [permitType, setPermitType] = React.useState<PermitType>("PFA");
  const [permitNumber, setPermitNumber] = React.useState("");
  const [ufa, setUfa] = React.useState("");
  const [aacOptions, setAacOptions] = React.useState<FellingAacOption[] | null>(null);
  const [aacId, setAacId] = React.useState<number | null>(null);
  const [campaign, setCampaign] = React.useState(String(new Date().getFullYear()));
  const [lines, setLines] = React.useState<LineDraft[]>([newLine()]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<DeclarationCreated | null>(null);

  React.useEffect(() => {
    listFellingAacOptions()
      .then(setAacOptions)
      .catch(() => setAacOptions([]));
  }, []);

  const selectedAac = aacOptions?.find((a) => a.id === aacId) ?? null;

  const chooseAac = (option: FellingAacOption) => {
    setAacId(option.id);
    setUfa(option.ufa_label);
    if ((PERMIT_TYPES as string[]).includes(option.title_type)) setPermitType(option.title_type as PermitType);
    if (option.title_reference) setPermitNumber((current) => current.trim() || option.title_reference || "");
    if (option.campaign_year) setCampaign(String(option.campaign_year));
  };

  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async () => {
    if (!selectedAac) {
      setError(t.aacRequired);
      return;
    }
    if (selectedAac.blocker) {
      setError(t.blockers[selectedAac.blocker] ?? selectedAac.blocker);
      return;
    }
    if (!permitNumber.trim()) {
      setError(t.permitRequired);
      return;
    }
    const clean = lines
      .map((l) => ({ ...l, tree_code: l.tree_code.trim() }))
      .filter((l) => l.tree_code.length > 0);
    if (clean.length === 0) {
      setError(t.atLeastOneTree);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createDeclaration({
        permit_type: permitType,
        permit_number: permitNumber.trim(),
        ufa_label: ufa.trim() || null,
        aac_label: selectedAac.label,
        title_id: selectedAac.title_id,
        aac_id: selectedAac.id,
        campaign_year: parseInt(campaign, 10) || null,
        lines: clean.map((l) => ({
          tree_code: l.tree_code,
          marking_type: l.marking_type,
          species_scientific_name: l.species_scientific_name?.trim() || null,
          measured_dbh_cm: l.measured_dbh_cm ?? null,
          latitude: l.latitude ?? null,
          longitude: l.longitude ?? null,
        })),
      });
      setResult(created);
    } catch (err) {
      console.error("declaration failed", err);
      const code = /"code":"([a-z_]+)"/.exec(err instanceof Error ? err.message : "")?.[1];
      setError(code && t.blockers[code] ? t.blockers[code] : t.error);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <View style={styles.container}>
        <Text style={styles.success}>{t.submitted}</Text>
        <Text style={styles.meta}>
          {t.declarationId(result.id)} · {t.status[result.status]}
        </Text>
        <ScrollView contentContainerStyle={styles.list}>
          {result.lines_checked.map((c) => (
            <View key={c.tree_code} style={styles.row}>
              <Text style={styles.code}>{c.tree_code}</Text>
              {c.dme_cm != null ? (
                <Text style={styles.meta}>DME {c.dme_cm} cm</Text>
              ) : null}
              <View style={styles.badges}>
                {c.violations.length === 0 ? (
                  <Text style={styles.ok}>OK</Text>
                ) : (
                  c.violations.map((v) => (
                    <Text key={v} style={styles.badge}>
                      {t.violation[v as keyof typeof t.violation] ?? v}
                    </Text>
                  ))
                )}
              </View>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.primary} onPress={onDone}>
          <Text style={styles.primaryText}>OK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.form}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.link}>← {fr.capture.back}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>{t.permitType}</Text>
      <View style={styles.chips}>
        {PERMIT_TYPES.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, permitType === p && styles.chipOn]}
            onPress={() => setPermitType(p)}
          >
            <Text style={[styles.chipText, permitType === p && styles.chipTextOn]}>
              {p === "foret_communautaire" ? t.permitCommunity : p}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t.permitNumber}</Text>
      <TextInput
        style={styles.input}
        value={permitNumber}
        onChangeText={setPermitNumber}
        placeholder="PFA-2026-07"
        placeholderTextColor={colors.textDim}
        autoCapitalize="characters"
      />
      <View style={styles.duo}>
        <View style={styles.flex1}>
          <Text style={styles.label}>{t.ufa}</Text>
          <TextInput
            style={styles.input}
            value={ufa}
            onChangeText={setUfa}
            placeholder="UFA-3"
            placeholderTextColor={colors.textDim}
          />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.label}>{t.campaign}</Text>
          <TextInput
            style={styles.input}
            value={campaign}
            onChangeText={setCampaign}
            keyboardType="numeric"
            placeholder="2026"
            placeholderTextColor={colors.textDim}
          />
        </View>
      </View>
      <Text style={styles.label}>{t.aacPick}</Text>
      <Text style={styles.meta}>{t.aacPickHint}</Text>
      {aacOptions == null ? (
        <ActivityIndicator color={colors.accent} />
      ) : aacOptions.length === 0 ? (
        <Text style={styles.meta} testID="aac-none">
          {t.aacNone}
        </Text>
      ) : (
        aacOptions.map((a) => (
          <TouchableOpacity
            key={a.id}
            testID={`aac-option-${a.id}`}
            style={[styles.card, aacId === a.id && styles.aacOn]}
            onPress={() => chooseAac(a)}
            accessibilityRole="button"
            accessibilityState={{ selected: aacId === a.id }}
          >
            <Text style={styles.cardTitle}>{`${a.label} · ${a.ufa_label}`}</Text>
            <Text style={a.blocker ? styles.aacBlocked : styles.aacOk}>
              {a.blocker ? (t.blockers[a.blocker] ?? a.blocker) : t.aacAllowed}
            </Text>
          </TouchableOpacity>
        ))
      )}

      <Text style={styles.section}>
        {t.trees} ({lines.length})
      </Text>
      {lines.map((line, i) => (
        <View key={line.key} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>#{i + 1}</Text>
            {lines.length > 1 ? (
              <TouchableOpacity
                onPress={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
              >
                <Text style={styles.remove}>{t.removeTree}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TextInput
            style={styles.input}
            value={line.tree_code}
            onChangeText={(v) => patchLine(line.key, { tree_code: v })}
            placeholder={t.treeCode}
            placeholderTextColor={colors.textDim}
            autoCapitalize="characters"
            testID={`tree-code-${i}`}
          />
          <View style={styles.chips}>
            {MARKINGS.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.chip, line.marking_type === m && styles.chipOn]}
                onPress={() => patchLine(line.key, { marking_type: m })}
              >
                <Text style={[styles.chipText, line.marking_type === m && styles.chipTextOn]}>
                  {t.markingLabel[m]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={line.species_scientific_name ?? ""}
            onChangeText={(v) => patchLine(line.key, { species_scientific_name: v })}
            placeholder={t.species}
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={line.measured_dbh_cm != null ? String(line.measured_dbh_cm) : ""}
            onChangeText={(v) => {
              const n = parseFloat(v.replace(",", "."));
              patchLine(line.key, { measured_dbh_cm: Number.isFinite(n) ? n : null });
            }}
            placeholder={t.dbh}
            placeholderTextColor={colors.textDim}
            keyboardType="numeric"
          />
        </View>
      ))}
      <TouchableOpacity
        style={styles.secondary}
        onPress={() => setLines((prev) => [...prev, newLine()])}
      >
        <Text style={styles.secondaryText}>+ {t.addTree}</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.primary, busy && styles.dim]}
        onPress={submit}
        disabled={busy}
        testID="submit-declaration"
      >
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.primaryText}>{t.submit}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  form: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  link: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  label: { color: colors.text, fontSize: type.caption, fontWeight: "700", marginTop: spacing.xs },
  section: { color: colors.accent, fontSize: type.body, fontWeight: "800", marginTop: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: type.caption, fontWeight: "700" },
  chipTextOn: { color: colors.primary },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: type.body,
  },
  duo: { flexDirection: "row", gap: spacing.sm },
  flex1: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: colors.text, fontSize: type.body, fontWeight: "800" },
  remove: { color: colors.error, fontSize: type.caption, fontWeight: "700" },
  secondary: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    padding: spacing.sm,
    alignItems: "center",
  },
  secondaryText: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
  dim: { opacity: 0.5 },
  error: { color: colors.error, fontSize: type.body, textAlign: "center" },
  success: { color: colors.success, fontSize: type.heading, fontWeight: "800", textAlign: "center", marginTop: spacing.xl },
  meta: { color: colors.textDim, fontSize: type.body, textAlign: "center", marginBottom: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  code: { color: colors.text, fontSize: type.body, fontWeight: "800" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  badge: {
    backgroundColor: colors.warning,
    color: colors.primary,
    fontSize: type.caption,
    fontWeight: "800",
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  ok: {
    backgroundColor: colors.success,
    color: "#FFFFFF",
    fontSize: type.caption,
    fontWeight: "800",
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  aacOn: { borderColor: colors.accent, borderWidth: 2 },
  aacOk: { color: colors.success, fontSize: type.caption, fontWeight: "700" },
  aacBlocked: { color: colors.warning, fontSize: type.caption, fontWeight: "700" },
});
