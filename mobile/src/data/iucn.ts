import { colors } from "../theme";

export const IUCN_LABELS: Record<string, string> = {
  EX: "Éteinte",
  EW: "Éteinte à l'état sauvage",
  CR: "En danger critique",
  EN: "En danger",
  VU: "Vulnérable",
  NT: "Quasi menacée",
  LC: "Préoccupation mineure",
  DD: "Données insuffisantes",
  NE: "Non évaluée",
};

export const IUCN_COLORS: Record<string, string> = {
  EX: colors.error,
  EW: colors.error,
  CR: colors.error,
  EN: colors.error,
  VU: colors.warning,
  NT: colors.warning,
  LC: colors.success,
};
