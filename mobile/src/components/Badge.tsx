import React from "react";

import type { AacStatus, AuthorizationStatus, CertStatus, ConventionStatus, DocStatus, StudyStatus, TaxStatus, TitleStatus } from "../api/client";
import { Pill, PillTone } from "../design/ui";

export type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const TONES: Record<Tone, PillTone> = {
  neutral: "neutral",
  success: "ok",
  warning: "warn",
  danger: "risk",
  accent: "gold",
};

export default function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <Pill label={label} tone={TONES[tone]} />;
}

export function docTone(status: DocStatus): Tone {
  switch (status) {
    case "valide":
      return "success";
    case "rejete":
      return "danger";
    case "soumis":
      return "warning";
    default:
      return "neutral";
  }
}

export function studyTone(status: StudyStatus): Tone {
  if (status === "valide") return "success";
  if (status === "rejete" || status === "expire") return "danger";
  if (status === "soumis") return "warning";
  return "neutral";
}

export function titleTone(status: TitleStatus): Tone {
  if (status === "actif") return "success";
  if (status === "rejete" || status === "retire" || status === "expire") return "danger";
  if (status === "demande") return "neutral";
  return "warning";
}

export function aacTone(status: AacStatus): Tone {
  if (status === "ouvert" || status === "autorise") return "success";
  if (status === "soumis") return "warning";
  return "neutral";
}

export function taxTone(status: TaxStatus): Tone {
  if (status === "paye") return "success";
  if (status === "en_retard") return "danger";
  return "warning";
}

export function authTone(status: AuthorizationStatus): Tone {
  if (status === "delivre") return "success";
  if (status === "rejete") return "danger";
  return "warning";
}

export function certTone(status: CertStatus): Tone {
  if (status === "actif") return "success";
  if (status === "rejete" || status === "expire") return "danger";
  if (status === "suspendu") return "warning";
  return "accent";
}

export function conventionTone(status: ConventionStatus): Tone {
  if (status === "active") return "success";
  if (status === "resiliee") return "danger";
  return "warning";
}
