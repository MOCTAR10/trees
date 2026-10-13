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
  AacOption,
  createProject,
  listAacOptions,
  ProjectKind,
  ProjectObjective,
  ProjectParticipation,
  ProjectTargetType,
} from "../api/client";
import { colors, spacing, type } from "../theme";

interface Props {
  onDone: () => void;
  onBack: () => void;
}

const OBJECTIVES: { value: ProjectObjective; label: string }[] = [
  { value: "cartographie", label: "Cartographie" },
  { value: "inventaire", label: "Inventaire" },
  { value: "sante", label: "Santé" },
  { value: "restauration", label: "Restauration" },
  { value: "autre", label: "Autre" },
];

const KINDS: { value: ProjectKind; label: string; hint: string }[] = [
  { value: "participatif", label: "Projet ouvert", hint: "Campagne participative : tout le monde peut contribuer." },
  { value: "chantier", label: "Chantier", hint: "Travail de terrain sur une AAC : zone et tiges du registre." },
];

const PARTICIPATIONS: { value: ProjectParticipation; label: string }[] = [
  { value: "open", label: "Ouvert à tous" },
  { value: "invitation", label: "Sur invitation" },
];

const TARGETS: { value: ProjectTargetType; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "species", label: "Espèce" },
  { value: "family", label: "Famille" },
  { value: "genus", label: "Genre" },
];

export default function CreateProjectScreen({ onDone, onBack }: Props) {
  const [kind, setKind] = React.useState<ProjectKind>("participatif");
  const [participation, setParticipation] = React.useState<ProjectParticipation>("open");
  const [aacs, setAacs] = React.useState<AacOption[]>([]);
  const [aacId, setAacId] = React.useState<number | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [objective, setObjective] = React.useState<ProjectObjective>("cartographie");
  const [targetType, setTargetType] = React.useState<ProjectTargetType>("all");
  const [targetValue, setTargetValue] = React.useState("");
  const [radius, setRadius] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (kind !== "chantier" || aacs.length) return;
    listAacOptions()
      .then(setAacs)
      .catch(() => setAacs([]));
  }, [kind, aacs.length]);

  const chooseKind = (next: ProjectKind) => {
    setKind(next);
    setParticipation(next === "chantier" ? "invitation" : "open");
  };

  const submit = async () => {
    if (!title.trim()) {
      setError("Saisissez un titre.");
      return;
    }
    if (kind === "chantier" && aacId == null) {
      setError("Choisissez l'AAC du chantier.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createProject({
        title: title.trim(),
        description: description.trim(),
        objective,
        target_type: targetType,
        target_value: targetType === "all" ? "" : targetValue.trim(),
        radius_km: kind === "chantier" ? null : radius ? Number(radius.replace(",", ".")) : null,
        kind,
        participation,
        aac_id: kind === "chantier" ? aacId : null,
      });
      onDone();
    } catch (err) {
      console.error("create project failed", err);
      setError("Création impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={styles.back}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nouveau projet</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Type</Text>
        <View style={styles.chips}>
          {KINDS.map((k) => (
            <TouchableOpacity
              key={k.value}
              testID={`kind-${k.value}`}
              style={[styles.chip, kind === k.value && styles.chipOn]}
              onPress={() => chooseKind(k.value)}
            >
              <Text style={[styles.chipText, kind === k.value && styles.chipTextOn]}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>{KINDS.find((k) => k.value === kind)?.hint}</Text>

        {kind === "chantier" ? (
          <>
            <Text style={styles.label}>AAC du chantier</Text>
            {aacs.length === 0 ? (
              <Text style={styles.hint}>Aucune AAC disponible pour votre entreprise.</Text>
            ) : (
              aacs.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  testID={`aac-${a.id}`}
                  style={[styles.aac, aacId === a.id && styles.chipOn]}
                  onPress={() => setAacId(a.id)}
                >
                  <Text style={[styles.chipText, aacId === a.id && styles.chipTextOn]}>
                    {`${a.label} · ${a.ufa_label} · ${a.registry_trees} tiges · ${a.status}`}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </>
        ) : null}

        <Text style={styles.label}>Participation</Text>
        <View style={styles.chips}>
          {PARTICIPATIONS.map((p) => (
            <TouchableOpacity
              key={p.value}
              testID={`participation-${p.value}`}
              style={[styles.chip, participation === p.value && styles.chipOn]}
              onPress={() => setParticipation(p.value)}
            >
              <Text style={[styles.chipText, participation === p.value && styles.chipTextOn]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Titre</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Ex. Cartographier l'Okoumé"
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Objectif, consignes…"
          placeholderTextColor={colors.textDim}
          style={[styles.input, styles.multiline]}
          multiline
        />

        <Text style={styles.label}>Objectif</Text>
        <View style={styles.chips}>
          {OBJECTIVES.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={[styles.chip, objective === o.value && styles.chipOn]}
              onPress={() => setObjective(o.value)}
            >
              <Text style={[styles.chipText, objective === o.value && styles.chipTextOn]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Cible</Text>
        <View style={styles.chips}>
          {TARGETS.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.chip, targetType === t.value && styles.chipOn]}
              onPress={() => setTargetType(t.value)}
            >
              <Text style={[styles.chipText, targetType === t.value && styles.chipTextOn]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {targetType !== "all" && (
          <>
            <Text style={styles.label}>Nom de la cible</Text>
            <TextInput
              value={targetValue}
              onChangeText={setTargetValue}
              placeholder="Ex. Aucoumea klaineana"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
          </>
        )}

        {kind === "participatif" ? (
          <>
            <Text style={styles.label}>Rayon (km, optionnel)</Text>
            <TextInput
              value={radius}
              onChangeText={setRadius}
              placeholder="Ex. 50"
              placeholderTextColor={colors.textDim}
              keyboardType="numeric"
              style={styles.input}
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.submit} onPress={submit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.submitText}>Publier le projet</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: type.body, fontWeight: "700" },
  title: { color: colors.text, fontSize: type.heading, fontWeight: "800", flexShrink: 1 },
  spacer: { width: 70 },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  label: { color: colors.textDim, fontSize: type.caption, textTransform: "uppercase", fontWeight: "700", marginTop: spacing.sm },
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
  multiline: { minHeight: 80, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: type.caption, fontWeight: "600" },
  chipTextOn: { color: colors.primary, fontWeight: "800" },
  error: { color: colors.error, fontSize: type.body },
  hint: { color: colors.textDim, fontSize: type.caption },
  aac: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  submitText: { color: colors.primary, fontSize: type.body, fontWeight: "800" },
});
