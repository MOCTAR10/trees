import { AlertTriangle, ChevronRight, CircleCheck, CircleX, ClipboardList, Info, ShieldAlert } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { CompanySpace, fileAnnualStatement, getCompanySpace } from "../api/client";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, Divider, EmptyState, Pill, PillTone, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import { exportControlPdf, sharePdf } from "../pdf";

const t = fr.companySpace;
const RESULT_TONE: Record<string, PillTone> = { conforme: "ok", reserve: "warn", non_conforme: "risk" };

interface Props {
  onOpen: (target: string) => void;
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Company home: actions due, Ministry decisions received, anomalies and controls. */
export default function CompanyHomeScreen({ onOpen }: Props) {
  const theme = useTheme();
  const s = useStyles();
  const [data, setData] = useState<CompanySpace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filing, setFiling] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "risk"; text: string } | null>(null);

  const fileStatement = async (year: number) => {
    setFiling(year);
    setNotice(null);
    try {
      const out = await fileAnnualStatement(year);
      setNotice({ tone: "ok", text: out.late ? t.filedLate(out.reference) : t.filed(out.reference) });
      setData(await getCompanySpace());
    } catch (err) {
      setNotice({ tone: "risk", text: err instanceof Error && err.message ? err.message : t.fileError });
    } finally {
      setFiling(null);
    }
  };

  const openPv = async (id: number, reference: string | null) => {
    try {
      await sharePdf(await exportControlPdf(id, reference));
    } catch {
      setNotice({ tone: "risk", text: fr.ministry.pvError });
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getCompanySpace());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <View style={s.screen}>
        {loading ? (
          <ActivityIndicator style={s.loader} color={theme.c.olive} />
        ) : error ? (
          <EmptyState message={fr.company.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />
        ) : null}
      </View>
    );
  }
  if (!data.organization) {
    return (
      <View style={s.screen}>
        <EmptyState message={t.noOrg} tone="warn" />
      </View>
    );
  }

  const levelIcon = (level: string) =>
    level === "risk" ? (
      <AlertTriangle size={16} color={theme.c.risk} />
    ) : level === "warn" ? (
      <ShieldAlert size={16} color={theme.c.warn} />
    ) : (
      <Info size={16} color={theme.c.info} />
    );

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      testID="company-home"
    >
      <Txt variant="title">{data.organization.name}</Txt>

      <Card raised testID="company-todo">
        <View style={s.row}>
          <ClipboardList size={18} color={theme.c.olive} />
          <Txt variant="heading" style={s.flex}>
            {t.todoTitle}
          </Txt>
          {data.todo.length ? <Pill tone="warn" label={String(data.todo.length)} /> : null}
        </View>
        {notice ? (
          <Txt variant="small" tone={notice.tone} testID="company-notice">
            {notice.text}
          </Txt>
        ) : null}
        {data.todo.length === 0 ? (
          <Txt variant="small" tone="muted">
            {t.todoEmpty}
          </Txt>
        ) : (
          data.todo.map((item, i) => (
            <View key={`${item.kind}-${i}`}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                testID={`todo-${item.kind}-${i}`}
                onPress={() => onOpen(item.target)}
                accessibilityRole="button"
                style={({ pressed }) => [s.todoRow, pressed && s.pressed]}
              >
                {levelIcon(item.level)}
                <Txt variant="small" style={s.flex}>
                  {item.label}
                </Txt>
                <ChevronRight size={16} color={theme.c.muted} />
              </Pressable>
              {item.kind === "statement" && item.year ? (
                <Button
                  testID={`file-statement-${item.year}`}
                  label={t.fileStatement(item.year)}
                  compact
                  loading={filing === item.year}
                  onPress={() => void fileStatement(item.year as number)}
                />
              ) : null}
            </View>
          ))
        )}
      </Card>

      <Card testID="company-decisions">
        <Txt variant="label" tone="gold">
          {t.decisionsTitle}
        </Txt>
        {data.decisions.length === 0 ? (
          <Txt variant="small" tone="muted">
            {t.decisionsEmpty}
          </Txt>
        ) : (
          data.decisions.map((d, i) => (
            <View key={`${d.kind}-${d.id}`} testID={`decision-${d.kind}-${d.id}`}>
              {i > 0 ? <Divider /> : null}
              <View style={s.decision}>
                {d.outcome === "rejet" ? (
                  <CircleX size={18} color={theme.c.risk} />
                ) : (
                  <CircleCheck size={18} color={theme.c.ok} />
                )}
                <View style={s.flex}>
                  <Txt variant="small" bold>
                    {`${t.kinds[d.kind] ?? d.kind} · ${d.label}`}
                  </Txt>
                  {d.motif ? (
                    <Txt variant="caption" tone={d.outcome === "rejet" ? "risk" : "muted"}>
                      {t.motif(d.motif)}
                    </Txt>
                  ) : null}
                  <Txt variant="caption" tone="muted">
                    {[fmtDate(d.decided_at), d.competent_codes.length ? `${fr.authorities.banner} · ${d.competent_codes.join(" / ")}` : fr.authorities.banner]
                      .filter(Boolean)
                      .join(" · ")}
                  </Txt>
                </View>
                <Pill tone={d.outcome === "rejet" ? "risk" : "ok"} label={d.outcome === "rejet" ? t.rejet : t.accord} />
              </View>
            </View>
          ))
        )}
      </Card>

      <Card testID="company-anomalies">
        <Txt variant="label" tone="muted">
          {t.anomaliesTitle}
        </Txt>
        {data.anomalies.length === 0 ? (
          <Txt variant="small" tone="muted">
            {t.anomaliesEmpty}
          </Txt>
        ) : (
          <>
            <Txt variant="caption" tone="muted">
              {t.anomaliesHint}
            </Txt>
            {data.anomalies.map((a, i) => (
              <View key={`${a.type}-${i}`} style={s.anomaly}>
                <Pill tone={a.severity === "hard" ? "risk" : "warn"} label={a.label} />
                <Txt variant="caption" tone="muted">
                  {[a.subject, a.detail].filter(Boolean).join(" · ")}
                </Txt>
              </View>
            ))}
          </>
        )}
      </Card>

      <Card testID="company-controls">
        <Txt variant="label" tone="muted">
          {t.controlsTitle}
        </Txt>
        {data.controls.length === 0 ? (
          <Txt variant="small" tone="muted">
            {t.controlsEmpty}
          </Txt>
        ) : (
          data.controls.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider /> : null}
              <View style={s.decision} testID={`company-control-${c.id}`}>
                <View style={s.flex}>
                  <Txt variant="small" bold>
                    {[fr.ministry.controlTypes[c.control_type], c.tree_code ?? c.aac_label].filter(Boolean).join(" · ")}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {[fmtDate(c.controlled_at), c.pv_reference ? `PV ${c.pv_reference}` : null].filter(Boolean).join(" · ")}
                  </Txt>
                  {c.notes ? <Txt variant="caption">{c.notes}</Txt> : null}
                </View>
                <View style={s.controlSide}>
                  <Pill tone={RESULT_TONE[c.result] ?? "neutral"} label={fr.ministry.results[c.result]} />
                  <Button
                    testID={`company-control-pdf-${c.id}`}
                    label={t.pvPdf}
                    variant="secondary"
                    compact
                    onPress={() => void openPv(c.id, c.pv_reference)}
                  />
                </View>
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
  loader: { flex: 1 },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  row: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  todoRow: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.sm },
  decision: { flexDirection: "row", alignItems: "flex-start", gap: th.space.sm, paddingVertical: th.space.sm },
  anomaly: { gap: 2, paddingVertical: th.space.xs, alignItems: "flex-start" },
  controlSide: { alignItems: "flex-end", gap: th.space.xs },
}));
