import { Role } from "../api/client";

export type TabKey = "home" | "species" | "identify" | "map" | "history";

export interface TabDef {
  key: TabKey;
  label: string;
  roles: Role[];
  centerFor?: Role[];
}

const ALL_ROLES: Role[] = ["operator", "company", "cooperative", "admin"];

export const TABS: TabDef[] = [
  { key: "home", label: "Accueil", roles: ALL_ROLES },
  { key: "species", label: "Espèce", roles: ALL_ROLES },
  { key: "identify", label: "Scan", roles: ["operator"], centerFor: ["operator"] },
  { key: "history", label: "Activités", roles: ALL_ROLES },
  { key: "map", label: "Carte", roles: ALL_ROLES },
];

export function tabsForRole(role: Role): TabDef[] {
  return TABS.filter((t) => t.roles.includes(role));
}
