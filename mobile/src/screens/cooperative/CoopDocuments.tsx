import React, { useState } from "react";
import { View } from "react-native";

import { ChecklistItem, CooperativeSpace } from "../../api/client";
import { DocumentModal } from "../../components/OrgDocuments";
import { CardGrid } from "../../design/layout";
import { makeStyles } from "../../design/ThemeProvider";
import { Button, Card, Pill, PillTone, Txt } from "../../design/ui";
import { fr } from "../../i18n/fr";

const t = fr.coop;
const DOC_TONE: Record<string, PillTone> = { valide: "ok", soumis: "info", manquant: "warn", expire: "risk", rejete: "risk" };

/** The cooperative's own pieces: profile checklist (« à valider par le métier ») and upload. */
export default function CoopDocuments({ space, onChanged }: { space: CooperativeSpace; onChanged: () => Promise<void> | void }) {
  const s = useStyles();
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const org = space.organization;
  const ok = space.checklist.filter((c) => c.status === "valide").length;

  return (
    <View style={s.wrap} testID="coop-documents">
      <Card>
        <Txt variant="label" tone="muted">
          {t.profileTitle}
        </Txt>
        <Txt bold>{org.profile_label ?? "—"}</Txt>
        {org.profile_description ? (
          <Txt variant="small" tone="muted">
            {org.profile_description}
          </Txt>
        ) : null}
        <Txt variant="caption" tone="warn" testID="coop-profile-note">
          {space.profile_note}
        </Txt>
      </Card>

      {message ? (
        <Txt variant="small" tone="ok">
          {message}
        </Txt>
      ) : null}

      <View style={s.head}>
        <Txt variant="heading" style={s.flex}>
          {fr.org.checklistTitle}
        </Txt>
        <Txt variant="small" tone="muted">
          {fr.org.complete(ok, space.checklist.length)}
        </Txt>
      </View>
      {space.checklist.length === 0 ? <Txt tone="muted">{fr.org.allGood}</Txt> : null}
      <CardGrid minColumnWidth={320}>
        {space.checklist.map((item) => (
          <Card key={item.doc_type} testID={`coop-doc-${item.doc_type}`}>
            <View style={s.head}>
              <Txt variant="small" bold style={s.flex}>
                {item.label}
              </Txt>
              <Pill tone={DOC_TONE[item.status] ?? "neutral"} label={fr.docs.status[item.status] ?? item.status} />
            </View>
            <Button
              compact
              variant="secondary"
              label={fr.docs.submit}
              testID={`doc-update-${item.doc_type}`}
              onPress={() => {
                setMessage(null);
                setEditing({ doc_type: item.doc_type, label: item.label, status: item.status as ChecklistItem["status"] });
              }}
            />
          </Card>
        ))}
      </CardGrid>

      {space.warnings.length ? (
        <Card testID="coop-own-warnings">
          <Txt variant="label" tone="muted">
            {t.ownWarnings}
          </Txt>
          {space.warnings.map((w, i) => (
            <Txt key={i} variant="small" tone="warn">
              {`• ${
                w.kind === "tax"
                  ? fr.ministry.warnTax(w.label ?? `Taxe ${w.tax_type ?? ""}`, w.period_year)
                  : fr.ministry.warnDocument(w.label ?? w.doc_type ?? "", w.status ?? "manquant")
              }`}
            </Txt>
          ))}
        </Card>
      ) : null}

      <DocumentModal
        item={editing}
        orgId={org.id}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          setMessage(fr.docs.saved);
          void onChanged();
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((th) => ({
  wrap: { gap: th.space.md },
  head: { flexDirection: "row", alignItems: "center", gap: th.space.sm },
  flex: { flex: 1 },
}));
