import * as Location from "expo-location";
import { Crosshair, QrCode } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";

import {
  createDeclaration,
  DeclarationCreated,
  DeclarationLineInput,
  FellingAacOption,
  isFellable,
  listFellingAacOptions,
  listRegistryTrees,
  MarkingType,
  parseScannedCode,
  RegistryTree,
} from "../api/client";
import QrScanner from "../components/QrScanner";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, KeyValue, Pill, ScreenHeader, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.felling;

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
  return { key: `line-${lineSeq}`, tree_code: "", marking_type: "qr" };
}

const coord = (v: number) => v.toFixed(5).replace(".", ",");

export default function DeclareScreen({ onDone, onBack }: Props) {
  const s = useStyles();
  const theme = useTheme();
  const [aacOptions, setAacOptions] = React.useState<FellingAacOption[] | null>(null);
  const [aacId, setAacId] = React.useState<number | null>(null);
  const [lines, setLines] = React.useState<LineDraft[]>([newLine()]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<DeclarationCreated | null>(null);
  const [inventory, setInventory] = React.useState<RegistryTree[]>([]);
  const [scanning, setScanning] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState<string | null>(null);
  const [locError, setLocError] = React.useState<string | null>(null);

  React.useEffect(() => {
    listFellingAacOptions()
      .then(setAacOptions)
      .catch(() => setAacOptions([]));
    listRegistryTrees("inventorie")
      .then(setInventory)
      .catch(() => setInventory([]));
  }, []);

  const selectedAac = aacOptions?.find((a) => a.id === aacId) ?? null;
  const listed = new Set(lines.map((l) => l.tree_code.trim()));
  const pending = inventory.filter(
    (tree) => isFellable(tree) && !listed.has(tree.tree_code) && (tree.aac_id == null || tree.aac_id === aacId),
  );

  const takeInventory = () => {
    lineSeq += 1;
    const added: LineDraft[] = pending.map((tree, i) => ({
      key: `inv-${lineSeq}-${i}`,
      tree_code: tree.tree_code,
      marking_type: tree.marking_type,
      species_scientific_name: tree.species_scientific_name,
      measured_dbh_cm: tree.measured_dbh_cm,
      latitude: tree.latitude,
      longitude: tree.longitude,
    }));
    setLines((prev) => [...prev.filter((l) => l.tree_code.trim().length > 0), ...added]);
  };

  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const locate = async (key: string) => {
    setLocating(key);
    setLocError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocError(t.positionDenied);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      patchLine(key, { latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch (err) {
      console.error("declaration locate failed", err);
      setLocError(t.positionDenied);
    } finally {
      setLocating(null);
    }
  };

  const submit = async () => {
    if (!selectedAac) {
      setError(t.aacRequired);
      return;
    }
    if (selectedAac.blocker) {
      setError(t.blockers[selectedAac.blocker] ?? selectedAac.blocker);
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
        aac_id: selectedAac.id,
        title_id: selectedAac.title_id,
        aac_label: selectedAac.label,
        ufa_label: selectedAac.ufa_label,
        campaign_year: selectedAac.campaign_year,
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
      <View style={s.container}>
        <ScreenHeader eyebrow={t.formEyebrow} title={t.submitted} />
        <ScrollView contentContainerStyle={s.form}>
          <Txt variant="heading" style={s.center}>
            {t.declarationId(result.id)} · {t.status[result.status]}
          </Txt>
          {result.lines_checked.map((c) => (
            <Card key={c.tree_code}>
              <View style={s.rowBetween}>
                <Txt variant="body" bold style={s.flex1}>
                  {c.tree_code}
                </Txt>
                {c.dme_cm != null ? (
                  <Txt variant="small" tone="muted">
                    DME {c.dme_cm} cm
                  </Txt>
                ) : null}
              </View>
              <View style={s.badges}>
                {c.violations.length === 0 ? (
                  <Pill label="OK" tone="ok" />
                ) : (
                  c.violations.map((v) => (
                    <Pill key={v} label={t.violation[v as keyof typeof t.violation] ?? v} tone="warn" />
                  ))
                )}
              </View>
            </Card>
          ))}
          <Button label="OK" onPress={onDone} />
        </ScrollView>
      </View>
    );
  }

  const titleType = selectedAac?.title_type ?? null;

  return (
    <View style={s.container}>
      <ScreenHeader eyebrow={t.formEyebrow} title={t.formTitle} onBack={onBack} backLabel={fr.capture.back} />
      <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
        <Txt variant="label" tone="olive">
          {t.stepAac}
        </Txt>
        <Txt variant="small" tone="muted">
          {t.aacPickHint}
        </Txt>
        {aacOptions == null ? (
          <ActivityIndicator color={theme.c.olive} />
        ) : aacOptions.length === 0 ? (
          <Txt variant="small" tone="muted" testID="aac-none">
            {t.aacNone}
          </Txt>
        ) : (
          <View style={s.aacGrid}>
            {aacOptions.map((a) => {
              const on = aacId === a.id;
              return (
                <Pressable
                  key={a.id}
                  testID={`aac-option-${a.id}`}
                  onPress={() => setAacId(a.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[s.aac, on && s.aacOn]}
                >
                  <View style={s.rowBetween}>
                    <Txt variant="body" bold style={s.flex1}>
                      {a.label}
                    </Txt>
                    <Pill label={a.blocker ? t.blockedAac : t.aacAllowed} tone={a.blocker ? "warn" : "ok"} />
                  </View>
                  <Txt variant="small" tone="muted">
                    {[a.ufa_label, a.title_reference, a.campaign_year].filter(Boolean).join(" · ")}
                  </Txt>
                  {a.blocker ? (
                    <Txt variant="small" tone="warn">
                      {t.blockers[a.blocker] ?? a.blocker}
                    </Txt>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <Txt variant="label" tone="olive" style={s.step}>
          {t.stepTitle}
        </Txt>
        {selectedAac && titleType ? (
          <Card testID="declare-title">
            <Pill label={t.titleTypeLabel[titleType] ?? titleType} tone="gold" />
            <View>
              <KeyValue label={t.titleRef} value={selectedAac.title_reference ?? "—"} />
              <KeyValue label={t.ufa} value={selectedAac.ufa_label} />
              <KeyValue label={t.campaign} value={selectedAac.campaign_year ? String(selectedAac.campaign_year) : "—"} />
            </View>
            {t.titleTypeNote[titleType] ? (
              <Txt variant="small" testID="declare-title-note">
                {t.titleTypeNote[titleType]}
              </Txt>
            ) : null}
            <Txt variant="caption" tone="muted">
              {t.titleFromAac}
            </Txt>
          </Card>
        ) : (
          <Txt variant="small" tone="muted">
            {t.chooseAacFirst}
          </Txt>
        )}

        <Txt variant="label" tone="olive" style={s.step}>
          {`${t.stepTrees} (${lines.length})`}
        </Txt>
        {pending.length > 0 ? (
          <Card>
            <Txt variant="small" tone="muted">
              {t.inventoryHint}
            </Txt>
            <Button
              variant="secondary"
              compact
              label={t.fromInventory(pending.length)}
              onPress={takeInventory}
              testID="declare-from-inventory"
            />
          </Card>
        ) : null}
        {lines.map((line, i) => {
          const located = line.latitude != null && line.longitude != null;
          return (
            <Card key={line.key} testID={`tree-line-${i}`}>
              <View style={s.rowBetween}>
                <Txt variant="heading">{t.treeN(i + 1)}</Txt>
                {lines.length > 1 ? (
                  <Pressable onPress={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                    <Txt variant="small" tone="risk" bold>
                      {t.removeTree}
                    </Txt>
                  </Pressable>
                ) : null}
              </View>
              <Txt variant="caption" tone="muted">
                {t.marking}
              </Txt>
              <Segmented
                testID={`marking-${i}`}
                options={MARKINGS.map((m) => ({ key: m, label: t.markingLabel[m] }))}
                value={line.marking_type}
                onChange={(m) => patchLine(line.key, { marking_type: m })}
              />
              <Txt variant="small" tone="muted" testID={`marking-hint-${i}`}>
                {t.markingHint[line.marking_type]}
              </Txt>
              <Txt variant="caption" bold>
                {t.codeLabel[line.marking_type]}
              </Txt>
              <View style={s.codeRow}>
                <TextInput
                  style={[s.input, s.flex1]}
                  value={line.tree_code}
                  onChangeText={(v) => patchLine(line.key, { tree_code: v })}
                  placeholder={t.codePlaceholder[line.marking_type]}
                  placeholderTextColor={theme.c.muted}
                  autoCapitalize="characters"
                  testID={`tree-code-${i}`}
                />
                {line.marking_type === "qr" && Platform.OS !== "web" ? (
                  <Button
                    compact
                    variant="secondary"
                    label={t.scanPlate}
                    icon={<QrCode size={18} color={theme.c.olive} />}
                    onPress={() => setScanning(line.key)}
                    testID={`scan-${i}`}
                  />
                ) : null}
              </View>
              <View style={s.duo}>
                <TextInput
                  style={[s.input, s.flex2]}
                  value={line.species_scientific_name ?? ""}
                  onChangeText={(v) => patchLine(line.key, { species_scientific_name: v })}
                  placeholder={t.species}
                  placeholderTextColor={theme.c.muted}
                  autoCapitalize="none"
                />
                <TextInput
                  style={[s.input, s.flex1]}
                  value={line.measured_dbh_cm != null ? String(line.measured_dbh_cm).replace(".", ",") : ""}
                  onChangeText={(v) => {
                    const n = parseFloat(v.replace(",", "."));
                    patchLine(line.key, { measured_dbh_cm: Number.isFinite(n) ? n : null });
                  }}
                  placeholder={t.dbh}
                  placeholderTextColor={theme.c.muted}
                  keyboardType="numeric"
                />
              </View>
              <View style={[s.position, !located && s.positionMissing]} testID={`position-${i}`}>
                <Crosshair size={18} color={located ? theme.c.ok : theme.c.warn} />
                <View style={s.flex1}>
                  <Txt variant="small" tone={located ? "ok" : "warn"} bold={located}>
                    {located
                      ? t.position(coord(line.latitude as number), coord(line.longitude as number))
                      : line.marking_type === "gps_photo"
                        ? t.positionRequired
                        : t.noPosition}
                  </Txt>
                  {!located && line.marking_type === "gps_photo" ? (
                    <Txt variant="caption" tone="muted">
                      {t.noPosition}
                    </Txt>
                  ) : null}
                </View>
                <Button
                  compact
                  variant={located ? "ghost" : "secondary"}
                  label={locating === line.key ? t.locating : located ? t.retakePosition : t.takePosition}
                  loading={locating === line.key}
                  onPress={() => void locate(line.key)}
                  testID={`locate-${i}`}
                />
              </View>
            </Card>
          );
        })}
        {locError ? (
          <Txt variant="small" tone="risk">
            {locError}
          </Txt>
        ) : null}
        <Button variant="secondary" label={`+ ${t.addTree}`} onPress={() => setLines((prev) => [...prev, newLine()])} />

        {error ? (
          <Txt variant="body" tone="risk" style={s.center}>
            {error}
          </Txt>
        ) : null}
        <Button label={t.submit} onPress={() => void submit()} loading={busy} disabled={busy} testID="submit-declaration" />
      </ScrollView>
      <Modal visible={scanning != null} animationType="slide" onRequestClose={() => setScanning(null)}>
        {scanning != null ? (
          <QrScanner
            hint={t.scanHint}
            cancelLabel={t.scanCancel}
            onCode={(raw) => {
              patchLine(scanning, { tree_code: parseScannedCode(raw).code, marking_type: "qr" });
              setScanning(null);
            }}
            onClose={() => setScanning(null)}
            testID="declare-scanner"
          />
        ) : null}
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  container: { flex: 1, backgroundColor: th.c.bg },
  form: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl, width: "100%", maxWidth: 880, alignSelf: "center" },
  step: { marginTop: th.space.md },
  center: { textAlign: "center" },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: th.space.sm },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  aacGrid: { flexDirection: "row", flexWrap: "wrap", gap: th.space.sm },
  aac: {
    flexGrow: 1,
    flexBasis: 260,
    backgroundColor: th.c.surface,
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.c.line,
    padding: th.space.lg,
    gap: th.space.xs,
  },
  aacOn: { borderColor: th.c.olive, borderWidth: 2, backgroundColor: th.c.surface2 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  duo: { flexDirection: "row", gap: th.space.sm },
  input: {
    backgroundColor: th.c.bg,
    borderRadius: th.radius.md,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.md,
    paddingVertical: th.space.sm,
    minHeight: 44,
    color: th.c.ink,
    fontSize: 15,
    fontFamily: th.fonts.body,
  },
  position: {
    flexDirection: "row",
    alignItems: "center",
    gap: th.space.sm,
    borderRadius: th.radius.md,
    padding: th.space.sm,
    backgroundColor: th.c.okSoft,
  },
  positionMissing: { backgroundColor: th.c.warnSoft },
}));
