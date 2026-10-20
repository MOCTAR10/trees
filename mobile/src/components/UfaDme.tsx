import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { clearUfaDme, getUfaDme, setUfaDme, UfaDmeEntry, UfaDmeView } from "../api/client";
import { fr } from "../i18n/fr";
import { useDialog } from "../design/layout";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import Badge, { type Tone } from "./Badge";

function originTone(origin: UfaDmeEntry["origin"]): Tone {
  if (origin === "ufa") return "success";
  if (origin === "provisional") return "warning";
  return "neutral";
}

/**
 * Minimum exploitable diameters for a management unit (UFA, Loi 016/01 art. 124).
 *
 * The list is the *effective* matrix: official values fixed for this UFA
 * (origin „ufa") merged over the provisional literature defaults. Ministry
 * users fix or clear an entry; the owning company sees the values that will be
 * enforced when it declares felling. Shared by CompanyTitles and AdminTitles.
 */
export default function UfaDme({ ufaId, mode }: { ufaId: number; mode: "company" | "admin" }) {
  const th = useTheme();
  const styles = useStyles();
  const [view, setView] = useState<UfaDmeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<UfaDmeEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setView(await getUfaDme(ufaId));
    } catch (err) {
      console.error("ufa dme load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ufaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = async (entry: UfaDmeEntry) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      setView(await clearUfaDme(ufaId, entry.species_scientific_name));
      setMessage(fr.titles.dme.resetDone);
    } catch (err) {
      console.error("ufa dme reset failed", err);
      setMessage(fr.titles.dme.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{fr.titles.dme.section}</Text>
      <Text style={styles.hint}>{fr.titles.dme.hint}</Text>

      {loading ? (
        <ActivityIndicator color={th.c.olive} />
      ) : (view?.entries.length ?? 0) === 0 ? (
        <Text style={styles.dim}>{fr.titles.dme.noEntries}</Text>
      ) : (
        (view?.entries ?? []).map((entry) => (
          <View key={entry.species_scientific_name} style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.species}>{entry.species_scientific_name}</Text>
              <Text style={styles.meta}>{`${fr.titles.dme.dmeCm} : ${entry.dme_cm}`}</Text>
              {entry.origin === "ufa" && entry.source ? (
                <Text style={styles.meta}>{entry.source}</Text>
              ) : null}
            </View>
            <View style={styles.trailing}>
              <Badge
                label={fr.titles.dme.origin[entry.origin] ?? entry.origin}
                tone={originTone(entry.origin)}
              />
              {mode === "admin" ? (
                entry.origin === "ufa" ? (
                  <TouchableOpacity
                    style={styles.smallBtn}
                    disabled={busy}
                    onPress={() => void reset(entry)}
                    testID={`dme-reset-${ufaId}-${entry.species_scientific_name}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.titles.dme.reset}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.smallBtn}
                    disabled={busy}
                    onPress={() => {
                      setMessage(null);
                      setEditing(entry);
                    }}
                    testID={`dme-fix-${ufaId}-${entry.species_scientific_name}`}
                  >
                    <Text style={styles.smallBtnText}>{fr.titles.dme.fix}</Text>
                  </TouchableOpacity>
                )
              ) : null}
            </View>
          </View>
        ))
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <EditModal
        ufaId={ufaId}
        entry={editing}
        onClose={() => setEditing(null)}
        onSaved={(next) => {
          setEditing(null);
          setView(next);
          setMessage(fr.titles.dme.saved);
        }}
      />
    </View>
  );
}

function EditModal({
  ufaId,
  entry,
  onClose,
  onSaved,
}: {
  ufaId: number;
  entry: UfaDmeEntry | null;
  onClose: () => void;
  onSaved: (next: UfaDmeView) => void;
}) {
  const dialog = useDialog();
  const th = useTheme();
  const styles = useStyles();
  const [dmeText, setDmeText] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry === null) return;
    setDmeText(String(entry.dme_cm));
    setSource("");
    setError(null);
  }, [entry]);

  const submit = async () => {
    if (entry === null || busy) return;
    const value = Number(dmeText.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || value > 400) {
      setError(fr.titles.dme.invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await setUfaDme(ufaId, [
        {
          species_scientific_name: entry.species_scientific_name,
          dme_cm: value,
          source: source.trim() || null,
        },
      ]);
      onSaved(next);
    } catch (err) {
      console.error("ufa dme save failed", err);
      setError(fr.titles.dme.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={entry !== null} transparent animationType={dialog.animation} onRequestClose={onClose}>
      <View style={[styles.backdrop, dialog.backdrop]}>
        <View style={[styles.modal, dialog.sheet]}>
          <Text style={styles.modalTitle}>{fr.titles.dme.section}</Text>
          <ScrollView contentContainerStyle={styles.form}>
            <Text style={styles.fieldLabel}>{entry?.species_scientific_name}</Text>
            <TextInput
              style={styles.input}
              placeholder={fr.titles.dme.dmeCm}
              placeholderTextColor={th.c.muted}
              value={dmeText}
              onChangeText={setDmeText}
              keyboardType="numeric"
              testID="dme-input"
            />
            <TextInput
              style={styles.input}
              placeholder={fr.titles.dme.sourcePlaceholder}
              placeholderTextColor={th.c.muted}
              value={source}
              onChangeText={setSource}
              testID="dme-source"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={busy}>
                <Text style={styles.cancelText}>{fr.titles.dme.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, busy && styles.submitDisabled]}
                onPress={submit}
                disabled={busy}
                testID="dme-save"
              >
                {busy ? (
                  <ActivityIndicator color={th.c.onOlive} />
                ) : (
                  <Text style={styles.submitText}>{fr.titles.dme.save}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((th) => ({
  section: { gap: th.space.xs, marginTop: th.space.sm },
  sectionTitle: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  hint: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body, marginBottom: th.space.xs },
  dim: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: th.space.sm,
    paddingVertical: th.space.xs,
    borderBottomWidth: 1,
    borderBottomColor: th.c.line,
  },
  info: { flex: 1, gap: 2 },
  species: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold },
  meta: { color: th.c.muted, fontSize: 12, fontFamily: th.fonts.body },
  trailing: { alignItems: "flex-end", gap: th.space.xs },
  smallBtn: {
    borderRadius: 6,
    paddingVertical: th.space.xs,
    paddingHorizontal: th.space.lg,
    backgroundColor: th.c.surface,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  smallBtnText: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold },
  message: { color: th.c.olive, fontSize: 12, fontFamily: th.fonts.bodyBold, marginTop: th.space.xs },
  error: { color: th.c.risk, fontSize: 12, fontFamily: th.fonts.body, marginBottom: th.space.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(14,21,18,0.8)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: th.c.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: th.space.xl,
    maxHeight: "85%",
  },
  form: { paddingBottom: th.space.sm },
  modalTitle: {
    color: th.c.ink,
    fontSize: 19,
    fontFamily: th.fonts.bodyBold,
    marginBottom: th.space.sm,
  },
  fieldLabel: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold, marginBottom: th.space.sm },
  input: {
    backgroundColor: th.c.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
    color: th.c.ink,
    paddingHorizontal: th.space.lg,
    paddingVertical: th.space.sm,
    fontSize: 15,
    fontFamily: th.fonts.body,
    marginBottom: th.space.sm,
  },
  actions: { flexDirection: "row", gap: th.space.sm, marginTop: th.space.sm },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: th.space.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: th.c.line,
  },
  cancelText: { color: th.c.ink, fontSize: 15, fontFamily: th.fonts.bodyBold },
  submitBtn: {
    flex: 2,
    alignItems: "center",
    paddingVertical: th.space.lg,
    borderRadius: 10,
    backgroundColor: th.c.olive,
  },
  submitText: { color: th.c.onOlive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  submitDisabled: { opacity: 0.6 },
}));
