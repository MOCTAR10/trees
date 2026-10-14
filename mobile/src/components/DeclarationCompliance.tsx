import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  assessFellingCompliance,
  ComplianceAssessment,
  ComplianceWarning,
  listDocumentTypes,
} from "../api/client";
import { fr } from "../i18n/fr";
import { makeStyles, useTheme } from "../design/ThemeProvider";
import Badge from "./Badge";

function warningLabel(w: ComplianceWarning, docLabels: Record<string, string>): string {
  if (w.kind === "document") {
    const code = w.doc_type ?? "";
    return fr.compliance.document(docLabels[code] ?? code);
  }
  if (w.kind === "tax") {
    const code = w.tax_type ?? "";
    return fr.compliance.tax(fr.taxes.type[code] ?? code, w.period_year ?? null);
  }
  if (w.kind === "title") return fr.compliance.titleInactive;
  if (w.kind === "aac") return fr.compliance.aac;
  if (w.code) return fr.compliance.code[w.code] ?? w.code;
  return "";
}

/** Two-tier compliance verdict for a felling declaration (Ministry view). */
export default function DeclarationCompliance({ declarationId }: { declarationId: number }) {
  const th = useTheme();
  const styles = useStyles();
  const [assessment, setAssessment] = useState<ComplianceAssessment | null>(null);
  const [docLabels, setDocLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [verdict, types] = await Promise.all([
        assessFellingCompliance(declarationId),
        listDocumentTypes(),
      ]);
      setAssessment(verdict);
      setDocLabels(Object.fromEntries(types.map((t) => [t.code, t.label])));
    } catch (err) {
      console.error("compliance load failed", err);
      setError(fr.docs.verifyError);
    } finally {
      setLoading(false);
    }
  }, [declarationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ActivityIndicator color={th.c.olive} />;
  }
  if (error || !assessment) {
    return <Text style={styles.error}>{error ?? fr.docs.verifyError}</Text>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.section}>{fr.compliance.title}</Text>
        {assessment.compliant ? (
          <Badge label={fr.compliance.compliant} tone="success" />
        ) : (
          <Badge label={fr.compliance.blocked(assessment.blockers.length)} tone="danger" />
        )}
      </View>

      {assessment.blockers.length > 0 ? (
        <>
          <Text style={styles.groupTitle}>{fr.compliance.blockers}</Text>
          {assessment.blockers.map((b, i) => (
            <Text key={`${b.tree_code}-${b.code}-${i}`} style={styles.blocker}>
              {`${b.tree_code} · ${fr.compliance.code[b.code] ?? b.code}`}
            </Text>
          ))}
        </>
      ) : null}

      {assessment.warnings.length > 0 ? (
        <>
          <Text style={styles.groupTitle}>{fr.compliance.warnings}</Text>
          {assessment.warnings.map((w, i) => (
            <Text key={`${w.kind ?? "w"}-${w.code ?? w.doc_type ?? i}`} style={styles.warning}>
              {`${w.tree_code ? `${w.tree_code} · ` : ""}${warningLabel(w, docLabels)}`}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  container: { gap: th.space.xs, marginTop: th.space.sm },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  section: { color: th.c.olive, fontSize: 15, fontFamily: th.fonts.bodyBold },
  groupTitle: { color: th.c.ink, fontSize: 12, fontFamily: th.fonts.bodyBold, marginTop: th.space.xs },
  blocker: { color: th.c.risk, fontSize: 12, fontFamily: th.fonts.bodyBold },
  warning: { color: th.c.warn, fontSize: 12, fontFamily: th.fonts.bodyBold },
  error: { color: th.c.risk, fontSize: 12, fontFamily: th.fonts.body },
}));
