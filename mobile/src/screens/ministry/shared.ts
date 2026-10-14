import { InboxQueueKey } from "../../api/client";

export type DomainKey =
  | "stats"
  | "titres"
  | "comptes"
  | "declarations"
  | "documents"
  | "etudes"
  | "certifications"
  | "anomalies"
  | "tracabilite"
  | "controles"
  | "fiscal"
  | "especes"
  | "profil";

/** Where a pending file of each queue is decided. */
export const QUEUE_DOMAIN: Record<InboxQueueKey, DomainKey> = {
  declarations: "declarations",
  documents: "documents",
  authorizations: "titres",
  pao: "titres",
  studies: "etudes",
  certifications: "certifications",
  eudr: "fiscal",
  titles: "titres",
  anomalies: "anomalies",
  orphans: "comptes",
};

/** Queues whose files open on the unified decision page. */
export const DECIDABLE: InboxQueueKey[] = [
  "declarations",
  "documents",
  "authorizations",
  "pao",
  "studies",
  "certifications",
  "eudr",
  "titles",
];

/** Whole days since an ISO date (0 = today), or null. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - when.getTime()) / 86400000));
}
