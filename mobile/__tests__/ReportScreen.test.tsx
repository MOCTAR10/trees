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
    expect(getByText("60.1 cm")).toBeTruthy();
    expect(getByText("-3.7 %")).toBeTruthy();
    expect(getByText("Clinomètre")).toBeTruthy();
    expect(getByText("• Focale lue dans la photo (EXIF)")).toBeTruthy();
    expect(getByTestId("carbon-card")).toBeTruthy();
    expect(getByText("5.42 t CO₂e")).toBeTruthy();
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
