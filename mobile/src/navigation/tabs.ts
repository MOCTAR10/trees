import { Role } from "../api/client";

export type TabKey = "home" | "species" | "identify" | "map" | "history" | "inbox" | "orgs" | "menu";

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

/** Ministry: decisions first, the map in the centre, the rest in the Menu. */
export const ADMIN_TABS: TabDef[] = [
  { key: "home", label: "Tableau de bord", roles: ["admin"] },
  { key: "inbox", label: "À traiter", roles: ["admin"] },
  { key: "map", label: "Carte", roles: ["admin"] },
  { key: "orgs", label: "Organisations", roles: ["admin"] },
  { key: "menu", label: "Menu", roles: ["admin"] },
];

export function tabsForRole(role: Role): TabDef[] {
  if (role === "admin") return ADMIN_TABS;
  return TABS.filter((t) => t.roles.includes(role));
}
