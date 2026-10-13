import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { HomeSummary } from "../src/api/client";
import { ThemeProvider } from "../src/design/ThemeProvider";
import HomeScreen from "../src/screens/HomeScreen";
import { StoredScan } from "../src/storage/history";

function scan(id: string, createdAt: string, extra: Partial<StoredScan["report"]> = {}): StoredScan {
  return {
    id,
    created_at: createdAt,
    latitude: 0.4,
    longitude: 9.4,
    valorization: null,
    report: {
      species_scientific_name: "Aucoumea klaineana",
      species_common_name_fr: "Okoumé",
      species_confidence: 0.72,
      measured_dbh_cm: 62.4,
      dbh_method: "operator_edges",
      dbh_confidence: 0.8,
      estimated_height_m: 28,
      estimated_age_years: null,
      age_model_used: null,
      health_status: null,
      soil_type: null,
      canopy_density_fcd: null,
      narrative_fr: null,
      co2e_kg: 5540,
      tree_code: "GA-2026-000123",
      forest_checks: { verdict: "conforme", flags: [] },
      ...extra,
    },
  };
}

const NOW = new Date(2026, 9, 13, 15, 0);

function renderHome(props: Partial<React.ComponentProps<typeof HomeScreen>> = {}) {
  const handlers = { onNew: jest.fn(), onHistory: jest.fn(), onSync: jest.fn(), onOpenScan: jest.fn() };
  const view = render(
    <ThemeProvider force="light">
      <HomeScreen scanCount={0} pendingCount={0} syncing={false} now={NOW} {...handlers} {...props} />
    </ThemeProvider>,
  );
  return { view, ...handlers };
}

describe("HomeScreen", () => {
  it("greets the agent by first name and starts a new analysis", () => {
    const { view, onNew } = renderHome({ firstName: "Nzé", matricule: "AGT-0004" });
    expect(view.getByText("Bonjour, Nzé")).toBeTruthy();
    expect(view.getByText("Agent de terrain · AGT-0004")).toBeTruthy();
    expect(view.getByTestId("home-offline-stats")).toBeTruthy();
    expect(view.getByText("Aucune analyse pour l'instant. Lancez votre première mesure.")).toBeTruthy();
    expect(view.queryByTestId("home-pending")).toBeNull();
    fireEvent.press(view.getByTestId("home-new-scan"));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("counts today's trees and CO2e, lists recent scans with their verdict", () => {
    const scans = [
      scan("a", new Date(2026, 9, 13, 9).toISOString()),
      scan("b", new Date(2026, 9, 13, 10).toISOString(), {
        species_scientific_name: "Pterocarpus soyauxii",
        species_common_name_fr: "Padouk",
        co2e_kg: 4000,
        tree_code: null,
        forest_checks: { verdict: "a_verifier", flags: [] },
      }),
      scan("c", new Date(2026, 9, 12, 10).toISOString(), { co2e_kg: 9999 }),
    ];
    const { view, onOpenScan, onHistory } = renderHome({ scans, scanCount: 3 });
    expect(view.getByTestId("home-count")).toHaveTextContent(/3/);
    expect(view.getByTestId("home-co2")).toHaveTextContent(/19,5/);
    fireEvent.press(view.getByTestId("home-period-today"));
    expect(view.getByTestId("home-count")).toHaveTextContent(/2/);
    expect(view.getByTestId("home-co2")).toHaveTextContent(/9,5/);
    expect(view.queryByTestId("home-recent-c")).toBeNull();
    fireEvent.press(view.getByTestId("home-kind-project"));
    expect(view.getByTestId("home-recent-empty")).toHaveTextContent("Aucun scan pour ce filtre.");
    fireEvent.press(view.getByTestId("home-kind-free"));
    fireEvent.press(view.getByTestId("home-period-all"));
    expect(view.getAllByText("Okoumé · 62,4 cm · GA-2026-000123")).toHaveLength(2);
    expect(view.getByText("Padouk · 62,4 cm")).toBeTruthy();
    expect(view.getByText("À vérifier")).toBeTruthy();
    fireEvent.press(view.getByTestId("home-recent-b"));
    expect(onOpenScan).toHaveBeenCalledWith(scans[1]);
    fireEvent.press(view.getByText("Tout voir"));
    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it("invites an agent without a name to add it in Profil", () => {
    const onOpenProfile = jest.fn();
    const { view } = renderHome({ onOpenProfile });
    expect(view.getByText("Bonjour")).toBeTruthy();
    fireEvent.press(view.getByTestId("home-add-name"));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it("shows server stats, group, invitations, joined projects and open projects", () => {
    const summary: HomeSummary = {
      person: {
        first_name: "Nzé",
        last_name: "Obiang",
        full_name: "Nzé Obiang",
        matricule: "AGT-DEMO-01",
        display_name: "Nzé Obiang",
        role: "operator",
      },
      scans: {
        total: 42,
        today: 3,
        week: 11,
        species: 9,
        co2e_kg: 18460,
        for_projects: 7,
        last_at: null,
        periods: {
          today: { count: 3, species: 2, co2e_kg: 4000, for_projects: 1 },
          week: { count: 11, species: 6, co2e_kg: 9000, for_projects: 3 },
          month: { count: 20, species: 8, co2e_kg: 12000, for_projects: 5 },
          all: { count: 42, species: 9, co2e_kg: 18460, for_projects: 7 },
        },
      },
      group: {
        type: "company",
        name: "Société Forestière Démo",
        members: 6,
        trees: 120,
        trees_week: 14,
        trees_by_period: { today: 4, week: 14, month: 40, all: 120 },
      },
      projects: {
        invitations: [
          {
            id: 7,
            title: "Chantier Démo — inventaire AAC 2026-01",
            kind: "chantier",
            participation: "invitation",
            objective: "inventaire",
            status: "open",
            target_type: "all",
            target_value: "",
            my_status: "invited",
            scans: 0,
            participants: 0,
            aac_label: "DEMO-AAC-2026-01",
            registry_trees: 9,
            registry_scanned: 0,
          },
        ],
        joined: [
          {
            id: 3,
            title: "Chantier Nord — inventaire complet des tiges de l'AAC 2026-03, UFA Ogooué-Lolo",
            kind: "chantier",
            participation: "invitation",
            objective: "inventaire",
            status: "open",
            target_type: "all",
            target_value: "",
            my_status: "active",
            my_scans: 2,
            scans: 5,
            participants: 3,
            aac_label: "AAC-N",
            registry_trees: 10,
            registry_scanned: 4,
          },
        ],
        available_count: 4,
        available: [
          {
            id: 8,
            title: "Cartographier le Moabi",
            kind: "participatif",
            participation: "open",
            objective: "cartographie",
            status: "open",
            target_type: "species",
            target_value: "Baillonella toxisperma",
            scans: 12,
            participants: 1,
          },
        ],
      },
    };
    const handlers = {
      onScanForProject: jest.fn(),
      onJoinProject: jest.fn(),
      onAcceptInvitation: jest.fn(),
      onDeclineInvitation: jest.fn(),
      onOpenProject: jest.fn(),
    };
    const { view } = renderHome({ summary, scanCount: 1, ...handlers });
    expect(view.getByText("Bonjour, Nzé")).toBeTruthy();
    expect(view.getByText("Agent de terrain · AGT-DEMO-01")).toBeTruthy();
    expect(view.getByTestId("home-count")).toHaveTextContent(/11/);
    expect(view.getByTestId("home-co2")).toHaveTextContent(/9,0/);
    expect(view.getByTestId("home-for-projects")).toHaveTextContent(/3/);
    expect(view.queryByTestId("home-offline-stats")).toBeNull();
    expect(view.getByTestId("home-group-name")).toHaveTextContent("Société Forestière Démo");
    expect(view.getByTestId("home-group-members")).toHaveTextContent(/6/);
    expect(view.getByTestId("home-group-week")).toHaveTextContent(/14/);
    expect(view.getByTestId("home-group-share")).toHaveTextContent("Votre part (7 jours) : 11 arbres sur 14");
    fireEvent.press(view.getByTestId("home-period-all"));
    expect(view.getByTestId("home-count")).toHaveTextContent(/42/);
    expect(view.getByTestId("home-co2")).toHaveTextContent(/18,5/);
    expect(view.getByTestId("home-group-week")).toHaveTextContent(/120/);
    expect(view.getByTestId("home-group-share")).toHaveTextContent("Votre part (tout) : 42 arbres sur 120");
    fireEvent.press(view.getByTestId("home-period-week"));
    expect(view.getByTestId("home-count-chantiers")).toHaveTextContent(/1/);
    expect(view.getByTestId("home-count-projects")).toHaveTextContent(/0/);
    expect(view.getByTestId("home-count-available")).toHaveTextContent(/4/);

    expect(view.getByText("DEMO-AAC-2026-01 · 0/9 tiges du registre mesurées")).toBeTruthy();
    fireEvent.press(view.getByTestId("home-accept-7"));
    expect(handlers.onAcceptInvitation).toHaveBeenCalledWith(7);
    fireEvent.press(view.getByTestId("home-decline-7"));
    expect(handlers.onDeclineInvitation).toHaveBeenCalledWith(7);

    expect(view.getByText("Chantier · AAC-N · 4/10 tiges du registre mesurées")).toBeTruthy();
    expect(
      view.getByText("Chantier Nord — inventaire complet des tiges de l'AAC 2026-03, UFA Ogooué-Lolo").props.numberOfLines,
    ).toBeUndefined();
    fireEvent.press(view.getByTestId("home-scan-project-3"));
    expect(handlers.onScanForProject).toHaveBeenCalledWith(summary.projects.joined[0]);

    fireEvent.press(view.getByTestId("home-open-project-3"));
    expect(handlers.onOpenProject).toHaveBeenCalledWith(summary.projects.joined[0]);
    fireEvent.press(view.getByTestId("home-open-invitation-7"));
    expect(handlers.onOpenProject).toHaveBeenCalledWith(summary.projects.invitations[0]);
    fireEvent.press(view.getByTestId("home-join-8"));
    expect(handlers.onJoinProject).toHaveBeenCalledWith(8);
  });

  it("shows the offline queue and syncs it", () => {
    const { view, onSync } = renderHome({ pendingCount: 2 });
    expect(view.getByText("Hors-ligne · 2 en attente")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Synchroniser les analyses en attente (2)"));
    expect(onSync).toHaveBeenCalledTimes(1);
  });
});
