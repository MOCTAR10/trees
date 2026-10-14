import { ChevronDown, ChevronUp } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";

import { decideDeclaration, Declaration, DeclarationLine, getDeclaration, listDeclarations } from "../api/client";
import { dec } from "../design/format";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import { Button, Card, Divider, EmptyState, Pill, PillTone, Segmented, Txt } from "../design/ui";
import { fr } from "../i18n/fr";
import DeclarationCompliance from "./DeclarationCompliance";

const t = fr.felling;

type Filter = "soumise" | "all";

const STATUS_TONE: Record<string, PillTone> = {
  soumise: "warn",
  autorisee: "ok",
  rejetee: "risk",
};

/** Felling declarations for the Ministry: lines, compliance, decision with a reason. */
export default function AdminDeclarations() {
  const theme = useTheme();
  const s = useStyles();
  const [rows, setRows] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("soumise");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lines, setLines] = useState<Record<number, DeclarationLine[]>>({});
  const [motif, setMotif] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [motifError, setMotifError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRows(await listDeclarations());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (id: number) => {
    setMotif("");
    setMotifError(false);
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!lines[id]) {
      try {
        const detail = await getDeclaration(id);
        setLines((prev) => ({ ...prev, [id]: detail.lines }));
      } catch {
        setLines((prev) => ({ ...prev, [id]: [] }));
      }
    }
  };

  const decide = async (id: number, decision: "autorisee" | "rejetee") => {
    if (decision === "rejetee" && !motif.trim()) {
      setMotifError(true);
      return;
    }
    setDeciding(true);
    try {
      await decideDeclaration(id, decision, motif.trim() || null);
      setMotif("");
      setExpanded(null);
      await load();
    } finally {
      setDeciding(false);
    }
  };

  if (loading && rows.length === 0) return <ActivityIndicator style={s.loader} color={theme.c.olive} />;
  if (error) return <EmptyState message={fr.admin.error} tone="risk" action={{ label: fr.common.retry, onPress: () => void load() }} />;

  const pending = rows.filter((d) => d.status === "soumise");
  const shown = filter === "soumise" ? pending : rows;

  return (
    <ScrollView contentContainerStyle={s.content} testID="admin-declarations">
      <Segmented
        options={[
          { key: "soumise", label: fr.ministry.toDecide(pending.length) },
          { key: "all", label: fr.ministry.allFiles(rows.length) },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {shown.length === 0 ? (
        <Txt tone="muted">{filter === "soumise" ? fr.ministry.nothingToDecide : t.noDeclarations}</Txt>
      ) : null}
      {shown.map((d) => {
        const open = expanded === d.id;
        return (
          <Card key={d.id} testID={`declaration-${d.id}`}>
            <Pressable onPress={() => void toggle(d.id)} accessibilityRole="button" style={s.head}>
              <View style={s.flex}>
                <Txt bold>{`${t.declarationId(d.id)} · ${d.permit_type} ${d.permit_number}`}</Txt>
                <Txt variant="caption" tone="muted">
                  {[`${d.line_count ?? 0} pieds`, d.aac_label, fr.ministry.authorityLine("Direction Provinciale")]
                    .filter(Boolean)
                    .join(" · ")}
                </Txt>
              </View>
              <Pill tone={STATUS_TONE[d.status] ?? "neutral"} label={t.status[d.status] ?? d.status} />
              {open ? <ChevronUp size={18} color={theme.c.muted} /> : <ChevronDown size={18} color={theme.c.muted} />}
            </Pressable>
            {d.decision_motif ? (
              <Txt variant="small" tone="muted">
                {d.decision_motif}
              </Txt>
            ) : null}
            {open ? (
              <View style={s.detail}>
                <Divider />
                {(lines[d.id] ?? []).map((l) => (
                  <View key={l.id} style={s.line}>
                    <View style={s.flex}>
                      <Txt variant="small" bold>
                        {l.tree_code}
                      </Txt>
                      <Txt variant="caption" tone="muted">
                        {[
                          l.species_scientific_name ?? "—",
                          l.measured_dbh_cm != null ? `${dec(l.measured_dbh_cm)} cm` : null,
                          l.dme_cm != null ? `DME ${dec(l.dme_cm, 0)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Txt>
                    </View>
                    {l.violations.length ? (
                      <Pill
                        tone="warn"
                        label={l.violations.map((v) => t.violation[v as keyof typeof t.violation] ?? v).join(" · ")}
                      />
                    ) : null}
                  </View>
                ))}
                <DeclarationCompliance declarationId={d.id} />
                {d.status === "soumise" ? (
                  <>
                    <TextInput
                      testID={`declaration-motif-${d.id}`}
                      style={[s.input, motifError && s.inputError]}
                      value={motif}
                      onChangeText={(v) => {
                        setMotif(v);
                        setMotifError(false);
                      }}
                      placeholder={t.motif}
                      placeholderTextColor={theme.c.muted}
                      multiline
                    />
                    {motifError ? (
                      <Txt variant="caption" tone="risk">
                        {fr.ministry.motifRequired}
                      </Txt>
                    ) : null}
                    <View style={s.actions}>
                      <Button
                        testID={`declaration-reject-${d.id}`}
                        label={t.reject}
                        variant="secondary"
                        disabled={deciding}
                        onPress={() => void decide(d.id, "rejetee")}
                        style={s.flex}
                      />
                      <Button
                        testID={`declaration-approve-${d.id}`}
                        label={t.approve}
                        loading={deciding}
                        onPress={() => void decide(d.id, "autorisee")}
                        style={s.flex}
                      />
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((th) => ({
  loader: { flex: 1, marginTop: th.space.xl },
  content: { padding: th.space.lg, gap: th.space.md, paddingBottom: th.space.xxl },
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  detail: { gap: th.space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: th.space.sm, paddingVertical: th.space.xs },
  input: {
    minHeight: 64,
    borderRadius: th.radius.md,
    borderWidth: 1.5,
    borderColor: th.c.line,
    backgroundColor: th.c.surface2,
    color: th.c.ink,
    fontFamily: th.fonts.body,
    fontSize: 15,
    padding: th.space.md,
    textAlignVertical: "top",
  },
  inputError: { borderColor: th.c.risk },
  actions: { flexDirection: "row", gap: th.space.sm },
}));
