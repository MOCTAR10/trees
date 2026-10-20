import { act, fireEvent, render, within } from "@testing-library/react-native";
import React from "react";

let mockDesktop = false;
jest.mock("../src/web/DesktopFrame", () => ({
  ...jest.requireActual("../src/web/DesktopFrame"),
  useDesktop: () => mockDesktop,
}));

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  getCurrentPositionAsync: jest.fn(),
}));

function mockAggregate(over: Record<string, unknown> = {}) {
  return {
    titles: { total: 1, by_type: { PFA: 1 }, by_status: { actif: 1 } },
    aac: { total: 1, by_status: { ouvert: 1 } },
    volumes: { declared_m3: 24.5, authorized_m3: 20, felled_m3: 12.25, declared_stems: 4, felled_stems: 2 },
    logs: { total: 4, by_status: { inventorie: 0, declare: 0, autorise: 2, abattu: 1, transporte: 1, receptionne: 0, transforme: 0 } },
    documents: { total: 3, by_status: { valide: 1, soumis: 0, manquant: 2, expire: 0, rejete: 0 } },
    taxes: { by_status: { du: 1, en_retard: 1, paye: 0 }, amount_fcfa: { du: 50000, en_retard: 125000, paye: 0 } },
    ...over,
  };
}

function mockMember(id: number, name: string, status: string, over: Record<string, unknown> = {}) {
  return {
    id,
    cooperative_org_id: 13,
    member_org_id: 100 + id,
    status,
    joined_on: "2026-09-01",
    left_on: status === "sortie" ? "2026-10-01" : null,
    status_reason: status === "active" ? null : "Cotisation impayée",
    notes: null,
    added_via: "cooperative",
    member_name: name,
    member_org_type: "entreprise",
    member_profile_label: "Exploitant",
    member_provinces: ["Ngounié"],
    aggregate: status === "active" ? mockAggregate() : null,
    ...over,
  };
}

const mockMembers = [
  mockMember(1, "Massana Bois", "active"),
  mockMember(2, "Scierie du Littoral", "suspendue"),
  mockMember(3, "Bois Ancien", "sortie"),
];

const mockBlock = {
  members: mockMembers,
  counts: { active: 1, suspendue: 1, sortie: 1 },
  totals: mockAggregate(),
  members_note: "Chaque membre conserve ses propres titres, autorisations et obligations ; la coopérative ne les remplace pas.",
};

jest.mock("../src/api/client", () => ({
  cooperativeResidues: jest.fn(async () => ({ profile_type: null, count: 0, residues: [] })),
  collectResidue: jest.fn(),
  getCooperativeSpace: jest.fn(async () => ({
    organization: {
      id: 13,
      name: "Coop Ngounié",
      profile_code: "cooperative_forestiere",
      profile_label: "Coopérative forestière",
      profile_description: "Regroupe de petits exploitants",
    },
    checklist: [
      { doc_type: "statuts_cooperative", label: "Statuts de la coopérative", status: "soumis" },
      { doc_type: "registre_membres_cooperative", label: "Registre des membres", status: "manquant" },
    ],
    profile_note: "Liste des pièces de la coopérative à valider par le métier.",
    warnings: [],
    ...mockBlock,
  })),
  searchCoopCandidates: jest.fn(async (q: string) =>
    [
      { id: 210, name: "Communauté de Mikongo", org_type: "communaute", provinces: ["Ogooué-Lolo"] },
      { id: 211, name: "Forêt Bleue", org_type: "entreprise", provinces: null },
    ].filter((c) => c.name.toLowerCase().includes(q.toLowerCase())),
  ),
  addCoopMember: jest.fn(async () => mockMember(9, "Forêt Bleue", "active")),
  updateCoopMember: jest.fn(async () => mockMember(1, "Massana Bois", "suspendue")),
  getCoopMember: jest.fn(async () => ({
    membership: mockMembers[0],
    aggregate: mockAggregate(),
    titles: [{ id: 5, title_type: "PFA", reference: "PFA-12", status: "actif", surface_ha: 50000, province_name: "Ngounié" }],
    aacs: [{ id: 29, label: "2026-1", status: "ouvert", campaign_year: 2026, title_ref: "PFA-12" }],
    felled_by_species: [{ species: "Aucoumea klaineana", stems: 2, volume_m3: 12.25 }],
    members_note: "Chaque membre conserve ses propres titres, autorisations et obligations ; la coopérative ne les remplace pas.",
  })),
  uploadDocument: jest.fn(async () => ({ id: 1 })),
  getOrganisationSheet: jest.fn(async () => ({
    entry: { id: 13, org_type: "cooperative", name: "Coop Ngounié", profile_label: "Coopérative forestière", surface_ha: 0, provinces: [] },
    titles: [],
    accounts: [],
    certifications: [],
    inventoryImports: [],
    warnings: [],
    cooperative: mockBlock,
    memberships: [],
  })),
  getProvinces: jest.fn(async () => []),
  getOrganisationDirectory: jest.fn(async () => [
    { id: 101, org_type: "entreprise", name: "Massana Bois", is_active: true, provinces: ["Ngounié"] },
    { id: 210, org_type: "communaute", name: "Communauté de Mikongo", is_active: true, provinces: ["Ogooué-Lolo"] },
    { id: 13, org_type: "cooperative", name: "Coop Ngounié", is_active: true, provinces: [] },
  ]),
  addOrgMember: jest.fn(async () => mockMember(10, "Communauté de Mikongo", "active")),
  updateOrgMember: jest.fn(async () => mockMember(1, "Massana Bois", "sortie")),
  registerTitle: jest.fn(),
  createOrganisationAccount: jest.fn(),
  setTitleProvince: jest.fn(),
}));

import * as client from "../src/api/client";
import CooperativeScreen from "../src/screens/CooperativeScreen";
import OrganisationScreen from "../src/screens/ministry/OrganisationScreen";

const mocked = client as jest.Mocked<typeof client>;
const user = { id: 9, email: "c@x", role: "cooperative" } as never;

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function openCoop() {
  const view = render(<CooperativeScreen user={user} onLogout={jest.fn()} showHeader={false} />);
  await flush();
  return view;
}

afterEach(() => {
  mockDesktop = false;
  jest.clearAllMocks();
});

describe("Cooperative space", () => {
  it("sums the active members: volumes, alerts, logs by status", async () => {
    const view = await openCoop();
    expect(view.getByText("Coop Ngounié")).toBeTruthy();
    expect(view.getByTestId("coop-stat-members")).toHaveTextContent(/1Membres actifs/);
    expect(view.getByTestId("coop-stat-felled")).toHaveTextContent(/12,3/);
    expect(view.getByTestId("coop-alerts")).toHaveTextContent(/2 pièces manquantes/);
    expect(view.getByTestId("coop-alerts")).toHaveTextContent(/1 taxe en retard · 125\s000 FCFA/);
    expect(view.getByTestId("coop-overview")).toHaveTextContent(/conserve ses propres titres/);
    expect(view.getByTestId("coop-logs-chart")).toBeTruthy();
  });

  it("lists members, hides former ones until asked, adds a member", async () => {
    const view = await openCoop();
    fireEvent.press(view.getByText("Membres"));
    expect(view.getByTestId("member-status-1")).toHaveTextContent("Active");
    expect(view.getByTestId("member-2")).toHaveTextContent(/Motif : Cotisation impayée/);
    expect(view.queryByTestId("member-3")).toBeNull();
    fireEvent(view.getByTestId("coop-show-former"), "valueChange", true);
    expect(view.getByTestId("member-3")).toHaveTextContent(/Sortie le 01\/10\/2026/);

    fireEvent.press(view.getByTestId("coop-add-member"));
    await flush();
    fireEvent.press(view.getByTestId("member-add-submit"));
    expect(view.getByTestId("member-add-error")).toHaveTextContent("Choisissez une organisation.");
    fireEvent.changeText(view.getByTestId("member-add-search"), "bleue");
    await flush();
    expect(view.queryByTestId("member-candidate-210")).toBeNull();
    expect(view.getByTestId("member-candidate-211")).toHaveTextContent(/Entreprise · Province non renseignée/);
    fireEvent.press(view.getByTestId("member-candidate-211"));
    fireEvent.press(view.getByTestId("member-add-submit"));
    await flush();
    expect(mocked.addCoopMember).toHaveBeenCalledWith({ member_org_id: 211, joined_on: null, notes: null });
    expect(view.getByTestId("coop-members-notice")).toHaveTextContent("Forêt Bleue est membre de la coopérative.");
    expect(mocked.getCooperativeSpace).toHaveBeenCalledTimes(2);
  });

  it("requires a reason to suspend, and reactivates a suspended member", async () => {
    const view = await openCoop();
    fireEvent.press(view.getByText("Membres"));
    fireEvent.press(view.getByTestId("member-suspend-1"));
    fireEvent.press(view.getByTestId("member-status-submit"));
    expect(view.getByTestId("member-status-error")).toHaveTextContent("Le motif est obligatoire.");
    fireEvent.press(view.getByText("Demande du membre"));
    fireEvent.press(view.getByTestId("member-status-submit"));
    await flush();
    expect(mocked.updateCoopMember).toHaveBeenCalledWith(1, { status: "suspendue", reason: "Demande du membre", left_on: null });

    fireEvent.press(view.getByTestId("member-reactivate-2"));
    await flush();
    expect(mocked.updateCoopMember).toHaveBeenCalledWith(2, { status: "active" });
  });

  it("opens a member read-only, then comes back", async () => {
    const view = await openCoop();
    fireEvent.press(view.getByText("Membres"));
    fireEvent.press(view.getByTestId("member-open-1"));
    await flush();
    expect(mocked.getCoopMember).toHaveBeenCalledWith(1);
    expect(view.getByTestId("coop-member-banner")).toHaveTextContent(/conserve ses propres titres/);
    expect(view.getByTestId("coop-member-titles")).toHaveTextContent(/PFA · PFA-12/);
    expect(view.getByTestId("coop-member-titles")).toHaveTextContent(/AAC 2026-1 · 2026/);
    expect(view.getByTestId("coop-member-species")).toHaveTextContent(/Aucoumea klaineana · 2 pieds/);
    expect(view.getByTestId("coop-member-taxes")).toHaveTextContent(/En retard · 1/);
    fireEvent.press(view.getAllByLabelText("← Retour")[0]);
    expect(view.getByTestId("coop-members")).toBeTruthy();
  });

  it("shows the cooperative's own checklist « à valider par le métier » and uploads a piece", async () => {
    const view = await openCoop();
    fireEvent.press(view.getByText("Conformité"));
    expect(view.getByTestId("coop-profile-note")).toHaveTextContent(/à valider par le métier/);
    expect(view.getByTestId("coop-doc-registre_membres_cooperative")).toHaveTextContent(/Manquant/);
    fireEvent.press(view.getByTestId("doc-update-registre_membres_cooperative"));
    fireEvent.changeText(view.getByPlaceholderText("Référence"), "REG-2026-01");
    fireEvent.press(view.getByTestId("doc-submit"));
    await flush();
    expect(mocked.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({ scope_type: "company", scope_id: 13, doc_type: "registre_membres_cooperative", reference: "REG-2026-01" }),
    );
  });
});

describe("Ministry sheet of a cooperative", () => {
  it("lists members as cards on the phone and ends a membership with a reason", async () => {
    const view = render(<OrganisationScreen id={13} onBack={jest.fn()} />);
    await flush();
    const card = view.getByTestId("org-coop-members");
    expect(card).toHaveTextContent(/1 actif · 1 suspendu · 1 sorti/);
    expect(view.getByTestId("org-coop-totals")).toHaveTextContent(/1 titres · 1 AAC · Abattu 12,3 m³ · 4 grumes/);
    expect(view.queryByTestId("org-coop-table")).toBeNull();
    expect(within(card).getByTestId("member-1")).toBeTruthy();

    fireEvent.press(view.getByTestId("member-leave-1"));
    fireEvent.changeText(view.getByTestId("member-status-reason"), "Exclusion décidée en assemblée");
    fireEvent.changeText(view.getByTestId("member-status-left"), "2026-10-15");
    fireEvent.press(view.getByTestId("member-status-submit"));
    await flush();
    expect(mocked.updateOrgMember).toHaveBeenCalledWith(13, 1, {
      status: "sortie",
      reason: "Exclusion décidée en assemblée",
      left_on: "2026-10-15",
    });
  });

  it("shows a sortable table on the desktop and adds a member from the directory", async () => {
    mockDesktop = true;
    const view = render(<OrganisationScreen id={13} onBack={jest.fn()} />);
    await flush();
    expect(view.getByTestId("org-coop-table")).toBeTruthy();
    expect(view.getByTestId("org-coop-row-1")).toHaveTextContent(/Massana Bois/);
    expect(view.getByTestId("org-coop-row-1")).toHaveTextContent(/2 pièces manquantes/);
    expect(view.getByTestId("org-coop-row-2")).toHaveTextContent(/Motif : Cotisation impayée/);

    fireEvent.press(view.getByTestId("org-add-member"));
    await flush();
    expect(view.queryByTestId("member-candidate-101")).toBeNull();
    expect(view.queryByTestId("member-candidate-13")).toBeNull();
    fireEvent.press(view.getByTestId("member-candidate-210"));
    fireEvent.press(view.getByTestId("member-add-submit"));
    await flush();
    expect(mocked.addOrgMember).toHaveBeenCalledWith(13, { member_org_id: 210, joined_on: null, notes: null });
  });
});
