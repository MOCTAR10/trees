import * as Location from "expo-location";
import { Check, MapPin, QrCode, Search, Truck } from "lucide-react-native";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";

import {
  actOnTransportDocument,
  getTreeCustody,
  listTransportDocuments,
  parseScannedCode,
  recordCustodyEvent,
  TransportDocument,
  TreeCustody,
} from "../api/client";
import QrScanner from "../components/QrScanner";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, Divider, KeyValue, Pill, ScreenHeader, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.custody;
const STEP_STATUS = ["autorise", "abattu", "transporte", "receptionne", "transforme"];

interface Props {
  onBack?: () => void;
}

function Steps({ status }: { status: string }) {
  const theme = useTheme();
  const s = useStyles();
  const reached = STEP_STATUS.indexOf(status);
  return (
    <View style={s.steps} testID="custody-steps">
      {t.steps.map((label, i) => {
        const done = reached >= i;
        return (
          <View key={label} style={s.step}>
            <View style={[s.dot, done && { backgroundColor: theme.c.olive, borderColor: theme.c.olive }]}>
              {done ? <Check size={11} color={theme.c.onOlive} strokeWidth={3} /> : null}
            </View>
            <Txt variant="caption" tone={done ? undefined : "muted"} bold={i === reached} style={s.stepLabel}>
              {label}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

/** Follow a log through its chain of custody and record the step that is due. */
export default function CustodyScreen({ onBack }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [code, setCode] = useState("");
  const [tree, setTree] = useState<TreeCustody | null>(null);
  const [slip, setSlip] = useState<TransportDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const open = async (raw: string) => {
    const parsed = parseScannedCode(raw);
    if (!parsed.code) return;
    setCode(parsed.code);
    setLoading(true);
    setError(null);
    setInfo(null);
    setTree(null);
    setSlip(null);
    try {
      if (parsed.kind === "slip" || /^(BDR|FDR|SPC)-/i.test(parsed.code)) {
        const docs = await listTransportDocuments().catch(() => [] as TransportDocument[]);
        const found = docs.find((d) => d.reference.toUpperCase() === parsed.code.toUpperCase());
        if (found) setSlip(found);
        else setError(t.slipNotFound);
      } else {
        setTree(await getTreeCustody(parsed.code));
      }
    } catch (err) {
      setError(err instanceof Error && err.message && !/^Tree \d+$/.test(err.message) ? err.message : t.notFound);
    } finally {
      setLoading(false);
    }
  };

  const record = async () => {
    if (!tree?.next_event) return;
    setBusy(true);
    setError(null);
    let coords: { latitude: number; longitude: number } | null = null;
    if (tree.next_event === "abattu") {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        }
      } catch {
        coords = null;
      }
    }
    try {
      await recordCustodyEvent({
        tree_code: tree.tree_code,
        event: tree.next_event,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        note: note.trim() || null,
      });
      setNote("");
      setInfo(`${t.recorded}${tree.next_event === "abattu" ? ` · ${coords ? t.gpsAttached : t.gpsMissing}` : ""}`);
      setTree(await getTreeCustody(tree.tree_code));
    } catch (err) {
      setError(err instanceof Error ? err.message : fr.traceability.error);
    } finally {
      setBusy(false);
    }
  };

  const receive = async (docId: number) => {
    setBusy(true);
    setError(null);
    try {
      await actOnTransportDocument(docId, "receptionne");
      setInfo(t.received);
      if (tree) setTree(await getTreeCustody(tree.tree_code));
      if (slip) setSlip({ ...slip, status: "receptionne" });
    } catch (err) {
      setError(err instanceof Error ? err.message : fr.traceability.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.screen} testID="custody-screen">
      {onBack ? <ScreenHeader eyebrow={t.eyebrow} title={t.title} onBack={onBack} backLabel={fr.history.back} /> : null}
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Txt variant="small" tone="muted">
          {t.intro}
        </Txt>
        <View style={s.codeRow}>
          <TextInput
            testID="custody-code"
            style={[s.input, s.flex]}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => void open(code)}
            autoCapitalize="characters"
            placeholder={t.codeLabel}
            placeholderTextColor={theme.c.muted}
          />
          <Pressable
            testID="custody-scan"
            onPress={() => setScanning(true)}
            accessibilityRole="button"
            accessibilityLabel={t.scanQr}
            style={s.squareBtn}
          >
            <QrCode size={20} color={theme.c.onOlive} />
          </Pressable>
          <Pressable
            testID="custody-check"
            onPress={() => void open(code)}
            accessibilityRole="button"
            accessibilityLabel={t.check}
            style={[s.squareBtn, s.squareSecondary]}
          >
            <Search size={20} color={theme.c.olive} />
          </Pressable>
        </View>

        {loading ? <ActivityIndicator color={theme.c.olive} /> : null}
        {error ? (
          <Txt variant="small" tone="risk" testID="custody-error">
            {error}
          </Txt>
        ) : null}
        {info ? (
          <Txt variant="small" tone="ok" testID="custody-info">
            {info}
          </Txt>
        ) : null}

        {slip ? (
          <Card raised testID="custody-slip">
            <View style={s.row}>
              <Truck size={18} color={theme.c.olive} />
              <Txt variant="heading" style={s.flex}>
                {`${t.slip} ${slip.reference}`}
              </Txt>
              <Pill
                tone={slip.status === "receptionne" ? "ok" : "info"}
                label={fr.traceability.transportStatus[slip.status] ?? slip.status}
              />
            </View>
            {slip.org_name ? <KeyValue label={fr.traceability.from} value={slip.org_name} /> : null}
            {slip.destination_name ? <KeyValue label={fr.traceability.to} value={slip.destination_name} /> : null}
            <KeyValue label={fr.traceability.stems} value={String(slip.tree_codes.length)} />
            {slip.status === "emis" && slip.direction === "entrant" ? (
              <Button
                testID="custody-receive"
                label={t.receive(slip.reference)}
                loading={busy}
                onPress={() => void receive(slip.id)}
              />
            ) : null}
          </Card>
        ) : null}

        {tree ? (
          <>
            <Card raised testID="custody-tree">
              <View style={s.row}>
                <Txt variant="heading" style={s.flex}>
                  {tree.tree_code}
                </Txt>
                <Pill tone={tree.status === "transforme" ? "ok" : "info"} label={tree.status_label} />
              </View>
              {tree.species_scientific_name ? (
                <Txt variant="small" style={s.italic}>
                  {tree.species_scientific_name}
                </Txt>
              ) : null}
              <Steps status={tree.status} />
              {tree.custodian_name ? <KeyValue label={t.holder} value={tree.custodian_name} /> : null}
              {tree.aac_label ? <KeyValue label={t.aac} value={tree.aac_label} /> : null}
              {tree.df10_entry_no ? <KeyValue label={t.df10} value={tree.df10_entry_no} /> : null}
              {tree.hammer_mark ? <KeyValue label={t.hammer} value={tree.hammer_mark} /> : null}
            </Card>

            {tree.transport ? (
              <Card testID="custody-transport">
                <View style={s.row}>
                  <Truck size={16} color={theme.c.olive} />
                  <Txt variant="small" bold style={s.flex}>
                    {[t.inTransport(tree.transport.reference), tree.transport.destination_name ? t.toDestination(tree.transport.destination_name) : null]
                      .filter(Boolean)
                      .join(" ")}
                  </Txt>
                  <Pill tone="info" label={fr.traceability.transportStatus[tree.transport.status] ?? tree.transport.status} />
                </View>
                {tree.can_receive ? (
                  <Button
                    testID="custody-receive"
                    label={t.receive(tree.transport.reference)}
                    loading={busy}
                    onPress={() => void receive(tree.transport!.id)}
                  />
                ) : null}
              </Card>
            ) : null}

            {tree.is_holder && tree.next_event ? (
              <Card testID="custody-action">
                <Txt variant="caption" tone="muted">
                  {t.recordHint[tree.next_event]}
                </Txt>
                <TextInput
                  testID="custody-note"
                  style={s.input}
                  value={note}
                  onChangeText={setNote}
                  placeholder={t.notePlaceholder}
                  placeholderTextColor={theme.c.muted}
                />
                <Button
                  testID="custody-record"
                  label={t.record[tree.next_event]}
                  loading={busy}
                  onPress={() => void record()}
                  icon={tree.next_event === "abattu" ? <MapPin size={16} color={theme.c.onOlive} /> : undefined}
                />
              </Card>
            ) : (
              <Txt variant="caption" tone="muted" testID="custody-no-action">
                {!tree.is_holder ? t.readOnly : tree.status === "abattu" ? t.transportHint : t.noAction}
              </Txt>
            )}

            <Card>
              <Txt variant="label" tone="muted">
                {t.history}
              </Txt>
              {tree.history.length === 0 ? (
                <Txt variant="small" tone="muted">
                  {t.noHistory}
                </Txt>
              ) : (
                tree.history.map((h, i) => (
                  <View key={`${h.event}-${i}`}>
                    {i > 0 ? <Divider /> : null}
                    <View style={s.historyRow} testID={`custody-history-${h.event}`}>
                      <Txt variant="small" bold style={s.flex}>
                        {t.events[h.event] ?? h.event}
                      </Txt>
                      <Txt variant="caption" tone="muted">
                        {[
                          new Date(h.created_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                          h.actor,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Txt>
                    </View>
                    {h.note ? (
                      <Txt variant="caption" tone="muted">
                        {h.note}
                      </Txt>
                    ) : null}
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>
      {scanning ? (
        <QrScanner
          testID="custody-qr"
          hint={t.scanHint}
          cancelLabel={t.scanCancel}
          onCode={(value) => {
            setScanning(false);
            void open(value);
          }}
          onClose={() => setScanning(false)}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  italic: { fontStyle: "italic" },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
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
  squareBtn: {
    width: 48,
    height: 48,
    borderRadius: th.radius.md,
    backgroundColor: th.c.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  squareSecondary: { backgroundColor: th.c.surface, borderWidth: 1.5, borderColor: th.c.olive },
  steps: { flexDirection: "row", justifyContent: "space-between", paddingVertical: th.space.sm },
  step: { alignItems: "center", flex: 1, gap: 4 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: th.c.line,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: { textAlign: "center" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.xs },
}));
