import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { getTreeCustody, TreeCustody } from "../api/client";
import { makeStyles } from "../design/ThemeProvider";
import { Card, Divider, KeyValue, Pill, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.report.trail;

function day(iso: string | null | undefined): string {
  if (!iso) return t.none;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Chain of custody, DF10 entry and transport slip of the log whose plate was scanned. */
export default function TreeTrailCard({ code }: { code: string }) {
  const s = useStyles();
  const [tree, setTree] = useState<TreeCustody | null>(null);

  useEffect(() => {
    let alive = true;
    getTreeCustody(code)
      .then((v) => alive && setTree(v))
      .catch(() => alive && setTree(null));
    return () => {
      alive = false;
    };
  }, [code]);

  if (!tree) return null;
  return (
    <Card testID="tree-trail">
      <View style={s.head}>
        <Txt variant="heading">{t.title}</Txt>
        <Pill tone="gold" label={tree.status_label} />
      </View>
      <KeyValue label={t.df10} value={tree.df10_entry_no ?? t.none} />
      <KeyValue label={t.aac} value={tree.aac_label ?? t.none} />
      <KeyValue label={t.holder} value={tree.custodian_name ?? t.none} />
      <KeyValue label={t.felled} value={day(tree.felled_at)} />
      {tree.transport ? (
        <KeyValue label={t.slip} value={`${tree.transport.reference}${tree.transport.destination_name ? ` → ${tree.transport.destination_name}` : ""}`} />
      ) : null}
      {tree.history.length > 0 ? <Divider /> : null}
      {tree.history.slice(0, 5).map((h, i) => (
        <View key={`${h.event}-${i}`} style={s.event}>
          <Txt variant="small" bold>
            {t.events[h.event] ?? h.event}
          </Txt>
          <Txt variant="caption" tone="muted">
            {[day(h.created_at), h.actor].filter(Boolean).join(" · ")}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

const useStyles = makeStyles((th) => ({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: th.space.sm },
  event: { gap: 1, paddingVertical: 2 },
}));
