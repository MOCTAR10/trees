import { render, waitFor } from "@testing-library/react-native";
import React from "react";

const BASE = {
  family: "Orchidaceae",
  aliases: [],
  countries: ["GA"],
  iucn_status: "LC",
  cites_appendix: "",
  eu_listing: "",
  native_to_africa: true,
  wood_density_g_cm3: 0.5,
  max_height_m: 40,
  cr_asymptote_a_cm: 80,
  cr_rate_k: 0.03,
  cr_shape_p: 1.2,
  hd_a: 40,
  hd_b: 25,
  cr_source: "literature",
};

jest.mock("../src/api/client", () => ({
  ...jest.requireActual("../src/api/client"),
  getSpecies: jest.fn(async (name: string) =>
    name === "Tainia paucifolia"
      ? { ...BASE, scientific_name: name, common_name_fr: "", type: "plante" }
      : { ...BASE, scientific_name: name, common_name_fr: "Okoumé", type: "arbre", family: "Burseraceae" },
  ),
}));

import SpeciesDetailScreen from "../src/screens/SpeciesDetailScreen";

describe("Species detail by life form", () => {
  it("shows wood and growth data for a tree only", async () => {
    const tree = render(<SpeciesDetailScreen name="Aucoumea klaineana" onBack={jest.fn()} />);
    await waitFor(() => tree.getByText("Fiche arbre"));
    expect(tree.getByText("Densité du bois")).toBeTruthy();
    expect(tree.getByText("Croissance (Chapman-Richards)")).toBeTruthy();
  });

  it("shows a plant sheet without wood density or growth model", async () => {
    const plant = render(<SpeciesDetailScreen name="Tainia paucifolia" onBack={jest.fn()} />);
    await waitFor(() => plant.getByText("Fiche plante"));
    expect(plant.queryByText("Densité du bois")).toBeNull();
    expect(plant.queryByText("Croissance (Chapman-Richards)")).toBeNull();
    expect(plant.getByText("Plante non ligneuse")).toBeTruthy();
  });
});
