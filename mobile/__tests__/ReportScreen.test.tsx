import { render } from "@testing-library/react-native";
import React from "react";

import { V1Report } from "../src/api/client";
import ReportScreen from "../src/screens/ReportScreen";

const base: V1Report = {
  species_scientific_name: "Aucoumea klaineana",
  species_common_name_fr: "Okoumé",
  species_confidence: 0.91,
  measured_dbh_cm: 62.39,
  dbh_method: "tape_circumference",
  dbh_confidence: 0.98,
  estimated_height_m: 31.5,
  estimated_age_years: 64,
  age_model_used: "chapman_richards",
  health_status: "saine_apparence",
  soil_type: "clay",
  canopy_density_fcd: 0.62,
  narrative_fr: null,
  dbh_vision_cm: 60.1,
  dbh_discrepancy_pct: -3.7,
  measurement_notes: ["focal_exif", "reference_tape"],
  height_method: "clinometer",
  aboveground_biomass_kg: 2663.4,
  carbon_stock_kg: 1477.1,
  co2e_kg: 5416.1,
};

describe("ReportScreen measurement & carbon", () => {
  it("shows the reference method, the photo cross-check and the carbon stock", () => {
    const { getByText, getByTestId } = render(
      <ReportScreen report={base} onValorize={null} />,
    );
    expect(getByText("Ruban (circonférence ÷ π)")).toBeTruthy();
    expect(getByText("60,1 cm")).toBeTruthy();
    expect(getByText("−3,7 %")).toBeTruthy();
    expect(getByText("Clinomètre")).toBeTruthy();
    expect(getByText("Focale lue dans la photo (EXIF)")).toBeTruthy();
    expect(getByTestId("carbon-card")).toBeTruthy();
    expect(getByTestId("carbon-card")).toHaveTextContent(/5,42 t CO₂e/);
  });

  it("shows the QR-plate distance, other species and the GFW check", () => {
    const { getByText, getByTestId } = render(
      <ReportScreen
        report={{
          ...base,
          distance_m: 2.01,
          distance_source: "qr",
          species_candidates: [
            { scientific_name: "Aucoumea klaineana", common_name_fr: "Okoumé", score: 0.6, combined: 0.72, prior: "essence_gabon", local_occurrences: 40 },
            { scientific_name: "Canarium schweinfurthii", common_name_fr: "Aiélé", score: 0.2, combined: 0.19, prior: "presente_gabon", local_occurrences: 3 },
          ],
          forest_checks: { verdict: "conforme", flags: [], loss_years: [], radd_alerts: 0 },
        }}
        onValorize={null}
      />,
    );
    expect(getByText("2,01 m (mesurée par la plaque QR)")).toBeTruthy();
    expect(getByTestId("species-candidates")).toBeTruthy();
    expect(getByText("Canarium schweinfurthii (Aiélé)")).toBeTruthy();
    expect(getByText("Conforme (aucun signal)")).toBeTruthy();
  });

  it("explains how to get a diameter when none was measured", () => {
    const { getByText, queryByTestId } = render(
      <ReportScreen
        report={{
          ...base,
          measured_dbh_cm: null,
          dbh_method: "unavailable",
          dbh_vision_cm: null,
          dbh_discrepancy_pct: null,
          measurement_notes: ["depth_missing"],
          co2e_kg: null,
        }}
        onValorize={null}
      />,
    );
    expect(getByText(/Diamètre non mesuré/)).toBeTruthy();
    expect(getByText("Non mesuré")).toBeTruthy();
    expect(queryByTestId("carbon-card")).toBeNull();
  });

  it("says whether the scan was attached to the requested project, and why not", () => {
    const attached = render(
      <ReportScreen report={{ ...base, project_id: 7, project_title: "Chantier Démo" }} onValorize={null} />,
    );
    expect(attached.getByText("Rattaché à : Chantier Démo")).toBeTruthy();
    attached.unmount();
    const refused = render(
      <ReportScreen
        report={{ ...base, project_id: null, project_title: "Chantier Démo", project_note: "project_out_of_zone" }}
        onValorize={null}
      />,
    );
    expect(refused.getByText("Non rattaché à : Chantier Démo")).toBeTruthy();
    expect(refused.getByText(/hors de la zone du projet/)).toBeTruthy();
  });

  it("labels the Groq narrative as AI-written and indicative", () => {
    const { getByTestId } = render(
      <ReportScreen report={{ ...base, narrative_fr: "Cet Okoumé…" }} onValorize={null} />,
    );
    expect(getByTestId("narrative-ai").props.children).toMatch(/IA \(Groq\)/);
  });

  it("renders legacy reports saved before the measurement fields existed", () => {
    const legacy = {
      species_scientific_name: null,
      species_common_name_fr: null,
      species_confidence: null,
      measured_dbh_cm: null,
      dbh_method: "mock",
      dbh_confidence: null,
      estimated_height_m: null,
      estimated_age_years: null,
      age_model_used: null,
      health_status: null,
      soil_type: null,
      canopy_density_fcd: null,
      narrative_fr: null,
    } as V1Report;
    const { getByText } = render(<ReportScreen report={legacy} onValorize={null} />);
    expect(getByText("mock")).toBeTruthy();
  });
});
