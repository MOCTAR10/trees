import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../src/api/client", () => ({
  getAdminInbox: jest.fn(async () => ({
    total: 5,
    queues: [
      { key: "declarations", label: "Déclarations d'abattage", authority: "Direction Provinciale", count: 2, oldest_at: "2026-10-04T08:00:00Z" },
      { key: "studies", label: "Études PPF / EIE", authority: "DGFAP / DGE", count: 1, oldest_at: "2026-10-13T08:00:00Z" },
      { key: "anomalies", label: "Anomalies ouvertes", authority: "DGF", count: 2, oldest_at: null },
      { key: "titles", label: "Demandes de titre", authority: "DGF", count: 0, oldest_at: null },
    ],
    alerts: [
      { level: "risk", kind: "anomalies_hard", count: 1 },
      { level: "warn", kind: "taxes_overdue", count: 1, amount_fcfa: 3500000 },
      { level: "warn", kind: "statements_overdue", count: 2 },
    ],
  })),
  dashboardOverview: jest.fn(async () => ({
    harvest: { estimated_volume_m3: 18420 },
    taxes: { receipts_amount_fcfa: 38200000, overdue: 6 },
    carbon: { co2e_kg: 412000 },
  })),
  getProvinces: jest.fn(async () => [
    { code: "GA-6", name: "Ogooué-Ivindo", organisations: 2, titles: 3, surface_ha: 90000 },
    { code: "GA-7", name: "Ogooué-Lolo", organisations: 1, titles: 1, surface_ha: 60000 },
    { code: "GA-1", name: "Estuaire", organisations: 0, titles: 0, surface_ha: 0 },
  ]),
  getInboxItems: jest.fn(async () => [
    { id: 41, type: "declarations", label: "Déclaration n° 41 · CFAD 07", org_name: "SFD", created_at: "2026-10-04T08:00:00Z", authority: "Direction Provinciale", province_code: "GA-6", province_name: "Ogooué-Ivindo" },
    { id: 3, type: "studies", label: "EIE · CFAD-12", org_name: "CBG", created_at: "2026-10-13T08:00:00Z", authority: "DGFAP / DGE", province_code: "GA-7", province_name: "Ogooué-Lolo" },
  ]),
  getOrganisationDirectory: jest.fn(async () => [
    { id: 10, org_type: "entreprise", name: "Société Forestière Démo", profile_code: "integre", profile_label: "Exploitant intégré", is_active: true, tax_id: null, email: null, phone: null, titles: 2, surface_ha: 64000, provinces: ["GA-6"], accounts: 6, documents_missing: 0, documents_pending: 0, taxes_overdue: 0 },
    { id: 11, org_type: "communaute", name: "Communauté de Mikongo", profile_code: "foret_communautaire", profile_label: "Forêt communautaire", is_active: true, tax_id: null, email: null, phone: null, titles: 1, surface_ha: 5000, provinces: ["GA-7"], accounts: 0, documents_missing: 0, documents_pending: 0, taxes_overdue: 1 },
    { id: 13, org_type: "cooperative", name: "Coop Demo", profile_code: null, profile_label: null, is_active: true, tax_id: null, email: null, phone: null, titles: 0, surface_ha: 0, provinces: [], accounts: 1, documents_missing: 0, documents_pending: 0, taxes_overdue: 0 },
  ]),
  listOrgProfiles: jest.fn(async () => [{ code: "integre", label: "Exploitant intégré", org_type: "entreprise" }]),
  createOrganisation: jest.fn(async () => ({ organization: { id: 40, org_type: "cooperative", profile_code: null } })),
  getOrganisationSheet: jest.fn(async () => ({
    entry: { id: 10, org_type: "entreprise", name: "Société Forestière Démo", profile_label: "Exploitant intégré", surface_ha: 64000, provinces: ["GA-6"] },
    titles: [{ id: 5, title_type: "CFAD", reference: "CFAD-01", status: "actif", zone: "permanent", surface_ha: 64000, province_code: "GA-6", province_source: "geometrie", province_name: "Ogooué-Ivindo" }],
    accounts: [{ id: 14, email: "co@x", display_name: "SFD", first_name: null, last_name: null, matricule: null, role: "company", is_active: true }],
    certifications: [],
    inventoryImports: [
      { id: 3, organization_id: 10, organization_name: "Société Forestière Démo", aac_id: 29, aac_label: "AAC 2026-2", title_id: 5, title_reference: "CFAD-01", imported_by: 14, imported_by_name: "SFD", imported_by_email: "co@x", file_name: "inventaire_AAC.csv", file_format: "csv", model_version: "proposition-2026-10", rows_total: 6, stems_created: 6, to_fell_count: 3, kept_count: 3, warnings_count: 0, created_at: "2026-10-18T09:00:00Z" },
    ],
    warnings: [{ kind: "tax", tax_type: "superficie", period_year: 2026 }],
    cooperative: null,
    memberships: [
      { id: 7, cooperative_org_id: 13, cooperative_name: "Coop Demo", status: "active", joined_on: "2026-09-01", left_on: null },
      { id: 8, cooperative_org_id: 14, cooperative_name: "Coop Ancienne", status: "sortie", joined_on: "2025-01-01", left_on: "2026-01-01" },
    ],
  })),
  registerTitle: jest.fn(async () => ({ id: 6, status: "actif", province_code: "GA-7" })),
  createOrganisationAccount: jest.fn(async () => ({ id: 30, email: "agent@x", display_name: "Nzé Obiang" })),
  setTitleProvince: jest.fn(async () => ({ id: 5, province_code: "GA-4" })),
}));

import * as client from "../src/api/client";
import { tabsForRole } from "../src/navigation/tabs";
import InboxScreen from "../src/screens/ministry/InboxScreen";
import MenuScreen from "../src/screens/ministry/MenuScreen";
import MinistryHomeScreen from "../src/screens/ministry/MinistryHomeScreen";
import OrganisationScreen from "../src/screens/ministry/OrganisationScreen";
import OrganisationsScreen from "../src/screens/ministry/OrganisationsScreen";

const mocked = client as jest.Mocked<typeof client>;
const NOW = new Date("2026-10-14T10:00:00Z");
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("Ministry space", () => {
  beforeEach(() => jest.clearAllMocks());

  it("orders the Ministry bottom bar with the map in the centre", () => {
    expect(tabsForRole("admin").map((t) => t.label)).toEqual([
      "Tableau de bord",
      "À traiter",
      "Carte",
      "Organisations",
      "Menu",
    ]);
    expect(tabsForRole("operator").map((t) => t.key)).toContain("identify");
  });

  it("Tableau de bord shows key figures, alerts, the queues by urgency and provinces", async () => {
    const onOpenInbox = jest.fn();
    const onOpenOrgs = jest.fn();
    const onOpenDomain = jest.fn();
    const view = render(
      <MinistryHomeScreen firstName="Awa" onOpenInbox={onOpenInbox} onOpenOrgs={onOpenOrgs} onOpenDomain={onOpenDomain} now={NOW} />,
    );
    await flush();
    expect(view.getByText("Bonjour, Awa")).toBeTruthy();
    expect(view.getByTestId("kpi-volume")).toHaveTextContent(/18 k/);
    expect(view.getByTestId("kpi-revenue")).toHaveTextContent(/38,2 M/);
    expect(view.getByTestId("alert-anomalies_hard")).toHaveTextContent(/1 anomalie grave ouverte/);
    expect(view.getByText("À traiter · 5")).toBeTruthy();
    expect(view.getByTestId("queue-declarations")).toHaveTextContent(/Compétence : Direction Provinciale · via le Ministère · plus ancien : il y a 10 j/);
    expect(view.queryByTestId("queue-titles")).toBeNull();

    fireEvent.press(view.getByTestId("queue-declarations"));
    expect(onOpenInbox).toHaveBeenCalledWith("declarations");
    fireEvent.press(view.getByTestId("queue-anomalies"));
    expect(onOpenDomain).toHaveBeenCalledWith("anomalies");
    fireEvent.press(view.getByTestId("alert-taxes_overdue"));
    fireEvent.press(view.getByTestId("alert-statements_overdue"));
    expect(onOpenDomain).toHaveBeenCalledWith("anomalies");
    expect(view.getByTestId("alert-statements_overdue")).toHaveTextContent(/2 états annuels non transmis au 31 mars/);
    expect(onOpenDomain).toHaveBeenCalledWith("fiscal");
    fireEvent.press(view.getByTestId("province-GA-6"));
    expect(onOpenOrgs).toHaveBeenCalledWith("GA-6");
    expect(view.queryByTestId("province-GA-1")).toBeNull();
    fireEvent.press(view.getByTestId("ministry-stats"));
    expect(onOpenDomain).toHaveBeenCalledWith("stats");
  });

  it("À traiter lists every file with authority, province and age, filterable", async () => {
    const onOpenDomain = jest.fn();
    const view = render(<InboxScreen onOpenDomain={onOpenDomain} now={NOW} />);
    await flush();
    expect(view.getByText("À traiter · 2")).toBeTruthy();
    expect(view.getByTestId("inbox-item-declarations-41")).toHaveTextContent(/SFD · Ogooué-Ivindo · Compétence : Direction Provinciale · via le Ministère/);
    expect(view.getByTestId("inbox-item-declarations-41")).toHaveTextContent(/il y a 10 j/);
    fireEvent.press(view.getByTestId("inbox-type-studies"));
    expect(view.queryByTestId("inbox-item-declarations-41")).toBeNull();
    fireEvent.press(view.getByTestId("inbox-type-all"));
    fireEvent.press(view.getByTestId("inbox-province-GA-6"));
    expect(view.queryByTestId("inbox-item-studies-3")).toBeNull();
    fireEvent.press(view.getByTestId("inbox-item-declarations-41"));
    expect(onOpenDomain).toHaveBeenCalledWith("declarations");
    const onOpenItem = jest.fn();
    view.rerender(<InboxScreen onOpenDomain={onOpenDomain} onOpenItem={onOpenItem} now={NOW} />);
    fireEvent.press(view.getByTestId("inbox-item-declarations-41"));
    expect(onOpenItem).toHaveBeenCalledWith("declarations", 41);
  });

  it("opens À traiter already filtered on a queue", async () => {
    const view = render(<InboxScreen initialType="studies" onOpenDomain={jest.fn()} now={NOW} />);
    await flush();
    expect(view.queryByTestId("inbox-item-declarations-41")).toBeNull();
    expect(view.getByTestId("inbox-item-studies-3")).toBeTruthy();
  });

  it("Organisations filters by type, province and search, and creates a cooperative", async () => {
    const onOpen = jest.fn();
    const view = render(<OrganisationsScreen onOpen={onOpen} />);
    await flush();
    expect(view.getByText("Organisations · 3")).toBeTruthy();
    expect(view.getByTestId("org-11")).toHaveTextContent(/1 taxe en retard/);
    expect(view.getByTestId("org-13")).toHaveTextContent(/province non renseignée/);
    fireEvent.press(view.getByTestId("org-type-communaute"));
    expect(view.queryByTestId("org-10")).toBeNull();
    fireEvent.press(view.getByTestId("org-type-all"));
    fireEvent.press(view.getByTestId("org-province-GA-6"));
    expect(view.queryByTestId("org-11")).toBeNull();
    fireEvent.press(view.getByTestId("org-province-all"));
    fireEvent.changeText(view.getByTestId("org-search"), "mikongo");
    expect(view.queryByTestId("org-10")).toBeNull();
    fireEvent.press(view.getByTestId("org-11"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }));

    fireEvent.press(view.getByTestId("org-new"));
    await flush();
    fireEvent.changeText(view.getByTestId("org-create-name"), "Coop Ngounié");
    fireEvent.press(view.getByTestId("org-create-cooperative"));
    fireEvent.press(view.getByTestId("org-create-submit"));
    await flush();
    expect(mocked.createOrganisation).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Coop Ngounié", org_type: "cooperative", profile_code: null }),
    );
  });

  it("organisation sheet: titles with province, compliance, register a title and create an account", async () => {
    const view = render(<OrganisationScreen id={10} onBack={jest.fn()} />);
    await flush();
    expect(view.getByTestId("org-title-5")).toHaveTextContent(/Ogooué-Ivindo \(déduite de la géométrie\)/);
    expect(view.getByTestId("org-compliance")).toHaveTextContent(/Taxe superficie 2026 en retard/);
    expect(view.getByTestId("org-member-of")).toHaveTextContent("Membre de : Coop Demo");
    expect(view.queryByTestId("org-coop-members")).toBeNull();
    expect(view.getByTestId("org-inventory-import-3")).toHaveTextContent(/inventaire_AAC\.csv · 18\/10\/2026/);
    expect(view.getByTestId("org-inventory-import-3")).toHaveTextContent(/AAC 2026-2 · 6 tiges dont 3 à préserver/);

    fireEvent.press(view.getByTestId("org-register-title"));
    fireEvent.changeText(view.getByTestId("title-register-ref"), "CFAD-99");
    fireEvent.press(view.getByTestId("title-register-province-GA-7"));
    fireEvent.press(view.getByTestId("title-register-submit"));
    await flush();
    expect(mocked.registerTitle).toHaveBeenCalledWith(
      expect.objectContaining({ holder_org_id: 10, title_type: "CFAD", reference: "CFAD-99", status: "actif", province_code: "GA-7" }),
    );

    fireEvent.press(view.getByTestId("org-create-account"));
    fireEvent.press(view.getByTestId("account-create-submit"));
    expect(view.getByText("Champs obligatoires manquants.")).toBeTruthy();
    fireEvent.changeText(view.getByTestId("account-create-first"), "Nzé");
    fireEvent.changeText(view.getByTestId("account-create-last"), "Obiang");
    fireEvent.changeText(view.getByTestId("account-create-email"), "agent@x");
    fireEvent.changeText(view.getByTestId("account-create-password"), "Secret123");
    fireEvent.press(view.getByTestId("account-create-submit"));
    await flush();
    expect(mocked.createOrganisationAccount).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ role: "operator", first_name: "Nzé", last_name: "Obiang", email: "agent@x" }),
    );

    fireEvent.press(view.getByTestId("org-title-province-5"));
    await flush();
    fireEvent.press(view.getByTestId("province-pick-GA-6"));
    await flush();
    expect(mocked.setTitleProvince).toHaveBeenCalledWith(5, "GA-6");
  });

  it("Menu groups the remaining domains", () => {
    const onOpen = jest.fn();
    const onLogout = jest.fn();
    const view = render(<MenuScreen onOpen={onOpen} onLogout={onLogout} />);
    fireEvent.press(view.getByTestId("menu-stats"));
    expect(onOpen).toHaveBeenCalledWith("stats");
    for (const key of ["titres", "declarations", "documents", "etudes", "certifications", "anomalies", "tracabilite", "fiscal", "especes", "profil", "comptes"]) {
      expect(view.getByTestId(`menu-${key}`)).toBeTruthy();
    }
    fireEvent.press(view.getByTestId("menu-logout"));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
