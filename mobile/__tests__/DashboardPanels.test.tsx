import { render } from "@testing-library/react-native";
import React from "react";

import DashboardPanels, { DashboardTiles } from "../src/screens/ministry/DashboardPanels";

const FULL: any = {
  harvest: {
    registry_stems: 120,
    stems_felled: 40,
    estimated_volume_m3: 900,
    by_species: [{ species: "Okoumé", stems: 30, volume_m3: 600 }],
    by_status: { autorise: 80, abattu: 40 },
    transformation_rate: 0.25,
  },
  titles: { total: 4, surface_ha: 120000, by_status: { actif: { status: "actif", count: 3 } } },
  aac: { total: 6, possibility_m3: 5000, by_status: { ouvert: { status: "ouvert", count: 2 } } },
  documents: { total: 10, expired: 2, expiring_soon: 1, by_status: { valide: { status: "valide", count: 8 } } },
  taxes: { dues_total: 10, overdue: 2, settled: 5, overdue_amount_fcfa: 3500000, receipts: 4, receipts_amount_fcfa: 38200000 },
  community: { agreements: 3, active: 2, contribution_fcfa: 1200000, annual_volume_m3: 800, avg_fdl_rate: 4.5 },
  transport: { documents: 7, volume_m3: 300 },
  certifications: { total: 2, by_status: {}, by_scheme: [{ scheme: "FSC", count: 2, surface_ha: 50000 }] },
  carbon: { scans: 12, co2e_kg: 5000, reference_scans: 1, linked_scans: 9, by_aac: [{ aac_id: 1, aac_label: "AAC 07", title_ref: null, scans: 3, co2e_kg: 2000 }] },
};

describe("DashboardPanels", () => {
  it("shows the detailed sections from the overview", () => {
    const { getByTestId, getByText } = render(
      <>
        <DashboardTiles overview={FULL} />
        <DashboardPanels overview={FULL} />
      </>,
    );
    expect(getByTestId("tile-stems")).toBeTruthy();
    expect(getByText("Titres forestiers")).toBeTruthy();
    expect(getByText("Okoumé")).toBeTruthy();
    expect(getByTestId("panel-fiscal")).toBeTruthy();
    expect(getByText("50 %")).toBeTruthy();
    expect(getByText("AAC 07")).toBeTruthy();
  });

  it("shows only the requested panels (one page of the phone Accueil)", () => {
    const view = render(<DashboardPanels overview={FULL} panels={["fiscal", "social"]} />);
    expect(view.getByTestId("panel-fiscal")).toBeTruthy();
    expect(view.getByTestId("panel-social")).toBeTruthy();
    expect(view.queryByTestId("panel-exploitation")).toBeNull();
    expect(view.queryByTestId("panel-carbon")).toBeNull();
  });

  it("tolerates a partial overview", () => {
    const { getByTestId } = render(<DashboardPanels overview={{ harvest: { estimated_volume_m3: 1 } } as any} />);
    expect(getByTestId("ministry-details")).toBeTruthy();
  });
});
