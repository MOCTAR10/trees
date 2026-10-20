import { CoopAggregate, MembershipStatus } from "../../api/client";
import { PillTone } from "../../design/ui";
import { dec } from "../../design/format";
import { fr } from "../../i18n/fr";

export const LOG_ORDER = ["inventorie", "declare", "autorise", "abattu", "transporte", "receptionne", "transforme"] as const;
const DOC_ALERTS = ["manquant", "expire", "rejete"] as const;

export const MEMBERSHIP_TONE: Record<MembershipStatus, PillTone> = { active: "ok", suspendue: "warn", sortie: "neutral" };

export const fcfa = (amount: number) => Math.round(amount).toLocaleString("fr-FR");
export const m3 = (value: number) => dec(value, 1);

/** Missing / expired / rejected pieces and late or due taxes, as short French lines. */
export function aggregateAlerts(agg: CoopAggregate | null | undefined): { tone: "risk" | "warn"; text: string }[] {
  if (!agg) return [];
  const out: { tone: "risk" | "warn"; text: string }[] = [];
  for (const status of DOC_ALERTS) {
    const n = agg.documents.by_status[status] ?? 0;
    if (n > 0) out.push({ tone: status === "manquant" ? "warn" : "risk", text: fr.coop.docAlert(n, status) });
  }
  const late = agg.taxes.by_status.en_retard ?? 0;
  if (late > 0) out.push({ tone: "risk", text: fr.coop.taxLate(late, fcfa(agg.taxes.amount_fcfa.en_retard ?? 0)) });
  return out;
}

export function logChart(agg: CoopAggregate) {
  return LOG_ORDER.map((status) => ({
    label: fr.ministry.dash.treeStatus[status] ?? status,
    value: agg.logs.by_status[status] ?? 0,
  }));
}
