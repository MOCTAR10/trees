import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

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
    const { view, onNew } = renderHome({ userName: "Nzé Obiang" });
    expect(view.getByText("Bonjour, Nzé")).toBeTruthy();
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
    expect(view.getByTestId("home-today-trees")).toHaveTextContent(/2/);
    expect(view.getByTestId("home-today-co2")).toHaveTextContent(/9,5/);
    expect(view.getAllByText("Okoumé · 62,4 cm · GA-2026-000123")).toHaveLength(2);
    expect(view.getByText("Padouk · 62,4 cm")).toBeTruthy();
    expect(view.getByText("À vérifier")).toBeTruthy();
    fireEvent.press(view.getByTestId("home-recent-b"));
    expect(onOpenScan).toHaveBeenCalledWith(scans[1]);
    fireEvent.press(view.getByText("Tout voir"));
    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it("shows the offline queue and syncs it", () => {
    const { view, onSync } = renderHome({ pendingCount: 2 });
    expect(view.getByText("Hors-ligne · 2 en attente")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Synchroniser les analyses en attente (2)"));
    expect(onSync).toHaveBeenCalledTimes(1);
  });
});
