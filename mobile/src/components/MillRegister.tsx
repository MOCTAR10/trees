import { FileText, Factory } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";

import { getMillRegister, MillProduct, MillRegister as Register, recordMillOutput } from "../api/client";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { dec, frDate } from "../design/format";
import { Button, Card, Divider, EmptyState, Pill, Stat, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import { exportMillRegisterPdf, sharePdf } from "../pdf";

const t = fr.mill;
const PRODUCTS: MillProduct[] = ["sciage", "placage", "contreplaque", "bois_profile", "autre"];

interface Props {
  mode: "company" | "admin";
  orgId?: number;
}

/** Transformation register: logs received, lots produced, material yield. */
export default function MillRegister({ mode, orgId }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [data, setData] = useState<Register | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [product, setProduct] = useState<MillProduct>("sciage");
  const [volume, setVolume] = useState("");
  const [lot, setLot] = useState("");
  const [species, setSpecies] = useState("");
  const [destination, setDestination] = useState<"local" | "export">("local");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "risk"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getMillRegister(mode === "admin" ? orgId : null));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [mode, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (code: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const submit = async () => {
    const m3 = parseFloat(volume.replace(",", "."));
    if (picked.size === 0) {
      setNotice({ tone: "risk", text: t.pickLogs });
      return;
    }
    if (!Number.isFinite(m3) || m3 <= 0) {
      setNotice({ tone: "risk", text: t.volumeRequired });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const out = await recordMillOutput({
        product_type: product,
        volume_m3: m3,
        tree_codes: [...picked],
        lot_reference: lot.trim() || null,
        species_scientific_name: species.trim() || null,
        destination,
      });
      setNotice({ tone: "ok", text: t.recorded(out.transformed.length) });
      setPicked(new Set());
      setVolume("");
      setLot("");
      setSpecies("");
      await load();
    } catch (err) {
      setNotice({ tone: "risk", text: err instanceof Error && err.message ? err.message : t.error });
    } finally {
      setBusy(false);
    }
  };

  const pdf = async () => {
    try {
      await sharePdf(await exportMillRegisterPdf(mode === "admin" ? orgId : null, data?.year));
    } catch {
      setNotice({ tone: "risk", text: t.pdfError });
    }
  };

  if (!data) {
    return (
      <View style={s.screen}>
        {loading ? (
          <ActivityIndicator style={s.flex} color={theme.c.olive} />
        ) : error ? (
          <EmptyState message={t.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
        ) : null}
      </View>
    );
  }

  const tot = data.totals;
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      testID="mill-register"
    >
      <View style={s.row}>
        <Factory size={20} color={theme.c.olive} />
        <Txt variant="title" style={s.flex}>
          {t.title(data.year)}
        </Txt>
      </View>
      <Card raised>
        <View style={s.row}>
          <Stat compact value={dec(tot.input_m3)} unit="m³" label={t.received(tot.logs_received)} />
          <Stat compact value={dec(tot.output_m3)} unit="m³" label={t.produced} />
          <Stat
            compact
            value={tot.yield_pct == null ? "—" : dec(tot.yield_pct)}
            unit={tot.yield_pct == null ? undefined : "%"}
            label={t.yieldLabel}
            tone={tot.alert ? "risk" : "ink"}
            testID="mill-yield"
          />
        </View>
        {tot.alert ? (
          <Txt variant="small" tone="risk" testID="mill-alert">
            {t.alert(tot.max_yield_pct)}
          </Txt>
        ) : null}
        <Button testID="mill-pdf" label={t.pdf} variant="secondary" compact icon={<FileText size={16} color={theme.c.olive} />} onPress={() => void pdf()} />
      </Card>
      {notice ? (
        <Txt variant="small" tone={notice.tone} testID="mill-notice">
          {notice.text}
        </Txt>
      ) : null}

      {mode === "company" ? (
        <Card testID="mill-form">
          <Txt variant="heading">{t.newLot}</Txt>
          <Txt variant="caption" tone="muted">
            {t.stock(data.stock.length)}
          </Txt>
          {data.stock.length === 0 ? (
            <Txt variant="small" tone="muted">
              {t.stockEmpty}
            </Txt>
          ) : (
            <View style={s.chips}>
              {data.stock.map((tree) => (
                <Pressable
                  key={tree.tree_code}
                  testID={`mill-log-${tree.tree_code}`}
                  onPress={() => toggle(tree.tree_code)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: picked.has(tree.tree_code) }}
                  style={[s.chip, picked.has(tree.tree_code) && s.chipOn]}
                >
                  <Txt variant="caption" tone={picked.has(tree.tree_code) ? "onOlive" : "ink"}>
                    {tree.tree_code}
                  </Txt>
                </Pressable>
              ))}
            </View>
          )}
          <View style={s.chips}>
            {PRODUCTS.map((p) => (
              <Pressable
                key={p}
                testID={`mill-product-${p}`}
                onPress={() => setProduct(p)}
                style={[s.chip, product === p && s.chipOn]}
              >
                <Txt variant="caption" tone={product === p ? "onOlive" : "ink"}>
                  {t.products[p]}
                </Txt>
              </Pressable>
            ))}
          </View>
          <TextInput
            testID="mill-volume"
            style={s.input}
            value={volume}
            onChangeText={setVolume}
            placeholder={t.volume}
            placeholderTextColor={theme.c.muted}
            keyboardType="decimal-pad"
          />
          <TextInput
            testID="mill-lot"
            style={s.input}
            value={lot}
            onChangeText={setLot}
            placeholder={t.lot}
            placeholderTextColor={theme.c.muted}
            autoCapitalize="characters"
          />
          <TextInput
            style={s.input}
            value={species}
            onChangeText={setSpecies}
            placeholder={t.species}
            placeholderTextColor={theme.c.muted}
          />
          <View style={s.chips}>
            {(["local", "export"] as const).map((d) => (
              <Pressable key={d} onPress={() => setDestination(d)} style={[s.chip, destination === d && s.chipOn]}>
                <Txt variant="caption" tone={destination === d ? "onOlive" : "ink"}>
                  {t.destinations[d]}
                </Txt>
              </Pressable>
            ))}
          </View>
          <Button testID="mill-submit" label={t.record} loading={busy} disabled={data.stock.length === 0} onPress={() => void submit()} />
        </Card>
      ) : null}

      <Card testID="mill-outputs">
        <Txt variant="label" tone="gold">
          {t.outputs}
        </Txt>
        {data.outputs.length === 0 ? (
          <Txt variant="small" tone="muted">
            {t.outputsEmpty}
          </Txt>
        ) : (
          data.outputs.map((o, i) => (
            <View key={o.id}>
              {i > 0 ? <Divider /> : null}
              <View style={s.line}>
                <View style={s.flex}>
                  <Txt variant="small" bold>
                    {[o.lot_reference, o.product_label].filter(Boolean).join(" · ")}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {[frDate(o.produced_on), o.species_scientific_name, t.logs(o.tree_codes.length)].filter(Boolean).join(" · ")}
                  </Txt>
                </View>
                <Pill tone="info" label={`${dec(o.volume_m3)} m³`} />
              </View>
            </View>
          ))
        )}
      </Card>

      <Card testID="mill-inputs">
        <Txt variant="label" tone="muted">
          {t.inputs}
        </Txt>
        {data.inputs.length === 0 ? (
          <Txt variant="small" tone="muted">
            {t.inputsEmpty}
          </Txt>
        ) : (
          data.inputs.map((e, i) => (
            <View key={e.id}>
              {i > 0 ? <Divider /> : null}
              <View style={s.line}>
                <View style={s.flex}>
                  <Txt variant="small" bold>
                    {e.reference ?? `#${e.id}`}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {[frDate(e.received_at), e.from_org, t.logs(e.logs)].filter(Boolean).join(" · ")}
                  </Txt>
                </View>
                <Pill tone="neutral" label={e.volume_m3 == null ? "—" : `${dec(e.volume_m3)} m³`} />
              </View>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.c.bg },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: th.space.xs },
  chip: {
    borderRadius: th.radius.pill,
    borderWidth: 1,
    borderColor: th.c.line,
    paddingHorizontal: th.space.md,
    paddingVertical: 6,
    backgroundColor: th.c.surface2,
  },
  chipOn: { backgroundColor: th.c.olive, borderColor: th.c.olive },
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
}));
