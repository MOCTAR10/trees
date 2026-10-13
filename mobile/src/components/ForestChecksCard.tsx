import React from "react";

import { ForestChecks } from "../api/client";
import { dec } from "../design/format";
import { Bullet, Card, KeyValue, Pill, PillTone, Txt } from "../design/ui";
import { fr } from "../i18n/fr";

const t = fr.map;

export const VERDICT_COLORS: Record<string, string> = {
  conforme: "#2E9E5B",
  a_verifier: "#E0A100",
  risque_deforestation: "#D64545",
  indisponible: "#8A8F98",
};

export const VERDICT_TONE: Record<string, PillTone> = {
  conforme: "ok",
  a_verifier: "warn",
  risque_deforestation: "risk",
  indisponible: "neutral",
};

/** Global Forest Watch verdict + evidence (scan report and map point). */
export default function ForestChecksCard({
  checks,
  title,
}: {
  checks: ForestChecks;
  title?: string;
}) {
  const yesNo = (v: boolean | null | undefined) => (v == null ? "—" : v ? t.yes : t.no);
  return (
    <Card testID="forest-checks">
      {title ? <Txt variant="heading">{title}</Txt> : null}
      <Pill tone={VERDICT_TONE[checks.verdict] ?? "neutral"} label={t.verdicts[checks.verdict] ?? checks.verdict} />
      {checks.flags.map((flag) => (
        <Bullet key={flag} tone="warn">
          {t.flags[flag] ?? flag}
        </Bullet>
      ))}
      <KeyValue
        label={t.lossYears}
        value={checks.loss_years == null ? "—" : checks.loss_years.length ? checks.loss_years.join(", ") : t.none}
      />
      <KeyValue
        label={t.radd}
        value={
          checks.radd_alerts == null
            ? "—"
            : `${checks.radd_alerts}${checks.radd_latest ? ` (${checks.radd_latest})` : ""}`
        }
      />
      <KeyValue label={t.naturalForest} value={yesNo(checks.natural_forest_2020)} />
      <KeyValue label={t.protectedArea} value={checks.protected_area ?? t.none} />
      <KeyValue label={t.concession} value={checks.logging_concession ?? t.none} />
      {checks.mapped_agb_mg_ha != null ? (
        <KeyValue label={t.mappedBiomass} value={`${dec(checks.mapped_agb_mg_ha, 0)} t/ha`} />
      ) : null}
    </Card>
  );
}
