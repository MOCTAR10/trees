import * as Location from "expo-location";
import { MapPin, Plus, QrCode, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";

import {
  ControlLookup,
  ControlResult,
  ControlType,
  createFieldControl,
  FieldControl,
  listFieldControls,
  lookupControlCode,
} from "../../api/client";
import QrScanner from "../../components/QrScanner";
import { makeStyles, useTheme } from "../../design/ThemeProvider";
import { Button, Card, EmptyState, Pill, PillTone, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";
import { CheckRow } from "./DecisionScreen";

const t = fr.ministry;
const TYPES: ControlType[] = ["marquage", "visa_df10", "route", "transformation"];
const RESULTS: ControlResult[] = ["conforme", "reserve", "non_conforme"];
const RESULT_TONE: Record<ControlResult, PillTone> = { conforme: "ok", reserve: "warn", non_conforme: "risk" };

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  const s = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[s.chip, on && s.chipOn]}
      hitSlop={4}
    >
      <Txt variant="caption" bold={on} tone={on ? "onOlive" : "muted"}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Ministry field controls: list, then a new control from a scanned or typed code. */
export default function ControlsScreen() {
  const theme = useTheme();
  const s = useStyles();
  const [rows, setRows] = useState<FieldControl[]>([]);
  const [type, setType] = useState<ControlType | null>(null);
  const [result, setResult] = useState<ControlResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRows(await listFieldControls());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = rows.filter((r) => (!type || r.control_type === type) && (!result || r.result === result));

  return (
    <View style={s.screen} testID="controls-screen">
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading && rows.length > 0} onRefresh={() => void load()} />}
      >
        <Button
          testID="control-new"
          label={t.newControl}
          onPress={() => setCreating(true)}
          icon={<Plus size={18} color={theme.c.onOlive} />}
        />
        <View style={s.chips}>
          <Chip testID="control-filter-all" label={t.allTypes} on={!type} onPress={() => setType(null)} />
          {TYPES.map((k) => (
            <Chip key={k} testID={`control-filter-${k}`} label={t.controlTypes[k]} on={type === k} onPress={() => setType(k)} />
          ))}
        </View>
        <View style={s.chips}>
          <Chip testID="control-result-all" label={t.allResults} on={!result} onPress={() => setResult(null)} />
          {RESULTS.map((k) => (
            <Chip key={k} testID={`control-result-${k}`} label={t.results[k]} on={result === k} onPress={() => setResult(k)} />
          ))}
        </View>
        {loading && rows.length === 0 ? <ActivityIndicator color={theme.c.olive} /> : null}
        {error ? (
          <EmptyState message={fr.admin.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
        ) : !loading && shown.length === 0 ? (
          <Txt tone="muted">{t.noControls}</Txt>
        ) : null}
        {shown.map((c) => (
          <Card key={c.id} style={s.compact} testID={`control-${c.id}`}>
            <View style={s.row}>
              <View style={s.flex}>
                <Txt variant="small" bold>
                  {`${t.controlTypes[c.control_type]}${c.tree_code ? ` · ${c.tree_code}` : c.aac_label ? ` · ${c.aac_label}` : ""}`}
                </Txt>
                <Txt variant="caption" tone="muted">
                  {[
                    c.org_name,
                    new Date(c.controlled_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }),
                    c.controlled_by_name,
                    c.pv_reference,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Txt>
              </View>
              <Pill tone={RESULT_TONE[c.result]} label={t.results[c.result]} />
            </View>
            {c.notes ? <Txt variant="small">{c.notes}</Txt> : null}
            {c.competent_codes?.length ? (
              <Txt variant="caption" tone="muted">
                {t.authorityLine(c.competent_codes.join(" / "))}
              </Txt>
            ) : null}
          </Card>
        ))}
      </ScrollView>
      <NewControl visible={creating} onClose={() => setCreating(false)} onDone={() => void load()} />
    </View>
  );
}

function NewControl({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const theme = useTheme();
  const s = useStyles();
  const [type, setType] = useState<ControlType>("route");
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<ControlLookup | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ControlResult>("conforme");
  const [notes, setNotes] = useState("");
  const [pv, setPv] = useState("");
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setType("route");
    setCode("");
    setLookup(null);
    setResult("conforme");
    setNotes("");
    setPv("");
    setError(null);
    setGps(null);
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        setGps(null);
      }
    })();
  }, [visible]);

  const check = async (value: string) => {
    const v = value.trim();
    if (!v) return;
    setCode(v);
    setChecking(true);
    setError(null);
    try {
      const found = await lookupControlCode(v);
      setLookup(found);
      if (found.checks.some((c) => c.level === "ko")) setResult("non_conforme");
    } catch {
      setLookup(null);
      setError(t.unknownCode);
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    if (!lookup || lookup.kind === "unknown") {
      setError(t.needLookup);
      return;
    }
    if (result !== "conforme" && !notes.trim()) {
      setError(t.needFindings);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createFieldControl({
        control_type: type,
        result,
        tree_code: lookup.tree?.tree_code ?? null,
        transport_document_id: lookup.transport?.id ?? null,
        aac_id: lookup.tree?.aac_id ?? lookup.transport?.aac_id ?? null,
        org_id: lookup.tree?.org_id ?? lookup.transport?.org_id ?? null,
        notes: notes.trim() || null,
        pv_reference: pv.trim() || null,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet} testID="control-form">
          <Txt variant="heading">{t.newControl}</Txt>
          <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
            <View style={s.chips}>
              {TYPES.map((k) => (
                <Chip key={k} testID={`control-type-${k}`} label={t.controlTypes[k]} on={type === k} onPress={() => setType(k)} />
              ))}
            </View>
            <Txt variant="caption" tone="muted">
              {t.controlHints[type]}
            </Txt>
            <Txt variant="caption" tone="muted">
              {t.codeLabel}
            </Txt>
            <View style={s.codeRow}>
              <TextInput
                testID="control-code"
                style={[s.input, s.flex]}
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setLookup(null);
                }}
                onSubmitEditing={() => void check(code)}
                autoCapitalize="characters"
                placeholder="GA-…"
                placeholderTextColor={theme.c.muted}
              />
              <Pressable
                testID="control-scan"
                onPress={() => setScanning(true)}
                accessibilityRole="button"
                accessibilityLabel={t.scanQr}
                style={s.squareBtn}
              >
                <QrCode size={20} color={theme.c.onOlive} />
              </Pressable>
              <Pressable
                testID="control-check"
                onPress={() => void check(code)}
                accessibilityRole="button"
                accessibilityLabel={t.check}
                style={[s.squareBtn, s.squareSecondary]}
              >
                {checking ? <ActivityIndicator color={theme.c.olive} /> : <Search size={20} color={theme.c.olive} />}
              </Pressable>
            </View>
            {lookup ? (
              <View style={s.lookup} testID="control-lookup">
                {lookup.tree ? (
                  <Txt variant="small" bold>
                    {[lookup.tree.tree_code, lookup.tree.species_scientific_name, lookup.tree.aac_label, lookup.tree.org_name]
                      .filter(Boolean)
                      .join(" · ")}
                  </Txt>
                ) : lookup.transport ? (
                  <Txt variant="small" bold>{`${lookup.transport.reference} · ${lookup.transport.status}`}</Txt>
                ) : null}
                {lookup.checks.map((c, i) => (
                  <CheckRow key={`${c.label}-${i}`} level={c.level} label={c.label} />
                ))}
              </View>
            ) : null}
            <Txt variant="caption" tone="muted">
              {t.resultLabel}
            </Txt>
            <View style={s.chips}>
              {RESULTS.map((k) => (
                <Chip key={k} testID={`control-set-${k}`} label={t.results[k]} on={result === k} onPress={() => setResult(k)} />
              ))}
            </View>
            <TextInput
              testID="control-notes"
              style={[s.input, s.multiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t.findings}
              placeholderTextColor={theme.c.muted}
              multiline
            />
            <TextInput
              testID="control-pv"
              style={s.input}
              value={pv}
              onChangeText={setPv}
              placeholder={t.pvRef}
              placeholderTextColor={theme.c.muted}
            />
            <View style={s.gps}>
              <MapPin size={14} color={gps ? theme.c.ok : theme.c.muted} />
              <Txt variant="caption" tone={gps ? "ok" : "muted"}>
                {gps ? t.gpsAttached : t.gpsMissing}
              </Txt>
            </View>
            {error ? (
              <Txt variant="small" tone="risk" testID="control-error">
                {error}
              </Txt>
            ) : null}
          </ScrollView>
          <View style={s.actions}>
            <Button label={t.cancel} variant="secondary" onPress={onClose} style={s.flex} />
            <Button testID="control-submit" label={t.record} loading={busy} onPress={() => void submit()} style={s.flex} />
          </View>
        </View>
      </View>
      {scanning ? (
        <QrScanner
          testID="control-qr"
          hint={t.scanHint}
          cancelLabel={t.scanCancel}
          onCode={(value) => {
            setScanning(false);
            void check(value);
          }}
          onClose={() => setScanning(false)}
        />
      ) : null}
    </Modal>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  compact: { padding: th.space.md, gap: th.space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  chip: {
    minHeight: 32,
    paddingHorizontal: th.space.md,
    borderRadius: th.radius.pill,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    maxHeight: "92%",
    backgroundColor: th.c.bg,
    borderTopLeftRadius: th.radius.xl,
    borderTopRightRadius: th.radius.xl,
    padding: th.space.lg,
    gap: th.space.md,
  },
  form: { gap: th.space.sm },
  codeRow: { flexDirection: "row", gap: th.space.sm, alignItems: "center" },
  input: {
    minHeight: 48,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    backgroundColor: th.c.surface2,
    color: th.c.ink,
    fontFamily: th.fonts.body,
    fontSize: 15,
    paddingHorizontal: th.space.md,
  },
  multiline: { minHeight: 72, textAlignVertical: "top", paddingVertical: th.space.sm },
  squareBtn: {
    width: 48,
    height: 48,
    borderRadius: th.radius.md,
    backgroundColor: th.c.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  squareSecondary: { backgroundColor: th.c.surface, borderWidth: 1.5, borderColor: th.c.olive },
  lookup: {
    backgroundColor: th.c.surface,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.md,
    gap: 2,
  },
  gps: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { flexDirection: "row", gap: th.space.sm },
}));
