import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SpeciesScreen from "../src/screens/SpeciesScreen";
import SpeciesDetailScreen from "../src/screens/SpeciesDetailScreen";
import LoginScreen from "../src/screens/LoginScreen";
import type { CatalogueState, EnrichedSpecies } from "../src/storage/catalogueStore";

jest.mock("../src/storage/catalogueStore", () => {
  const React = require("react");
  const mk = (over: string, sci: string, type: string): EnrichedSpecies => ({
    scientific_name: sci,
    common_name_fr: over,
    family: "Fabaceae",
    wood_density_g_cm3: 0.6,
    iucn_status: "LC",
    cites_appendix: "",
    eu_listing: "",
    native_to_africa: true,
    aliases: [],
    countries: ["GA"],
    type,
    continents: ["Afrique"],
  });
  const arbres = [mk("Okoumé", "Aucoumea klaineana", "arbre")];
  const plantes = [mk("Njansang", "Ricinodendron heudelotii", "plante")];
  const sections = (list: EnrichedSpecies[]) => [{ title: "A", data: list }];
  const facets = {
    families: [],
    genera: [],
    countries: [],
    continents: [],
    iucn: [],
  };
  const snapshot: CatalogueState = {
    species: [...arbres, ...plantes],
    byScope: { arbres, plantes, biodiversite: [] },
    sectionsByScope: {
      arbres: sections(arbres),
      plantes: sections(plantes),
      biodiversite: [],
    },
    facetsByScope: { arbres: facets, plantes: facets, biodiversite: facets },
    counts: { arbres: 1, plantes: 1, biodiversite: 0 },
    trees: [],
    booting: false,
    refreshing: false,
    fromCache: true,
    treesReady: true,
    treesLoading: false,
    lastSyncedAt: null,
  };
  return {
    ensureCatalogue: jest.fn(() => Promise.resolve()),
    ensureTrees: jest.fn(() => Promise.resolve()),
    refreshCatalogue: jest.fn(() => Promise.resolve()),
    refreshTrees: jest.fn(() => Promise.resolve()),
    useCatalogue: () => snapshot,
  };
});

jest.mock("../src/api/client", () => {
  const actual = jest.requireActual("../src/api/client");
  return {
    ...actual,
    getSpecies: jest.fn(() =>
      Promise.resolve({
        scientific_name: "Aucoumea klaineana",
        common_name_fr: "Okoumé",
        wood_density_g_cm3: 0.44,
        cr_asymptote_a_cm: 80,
        cr_rate_k: 0.035,
        cr_shape_p: 1.2,
        hd_a: 40,
        hd_b: 25,
        iucn_status: "VU",
        max_height_m: 40,
        aliases: ["okoume"],
        family: "Burseraceae",
        cr_source: "literature",
        cites_appendix: "",
        eu_listing: "",
        native_to_africa: true,
        countries: ["GA"],
      }),
    ),
  };
});

const metrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
} as const;

function renderSpecies() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SpeciesScreen onOpenSpecies={() => undefined} />
    </SafeAreaProvider>,
  );
}

describe("smoke: no blank screen", () => {
  it("renders SpeciesScreen and switches scopes without crashing", async () => {
    const view = renderSpecies();
    expect(view.getByText(/Okoumé/)).toBeTruthy();
    fireEvent.press(view.getByText(/Plantes/));
    await waitFor(() => {
      expect(view.getByText(/Njansang/)).toBeTruthy();
    });
    fireEvent.press(view.getByText(/Biodiversité/));
    fireEvent.press(view.getByText(/Arbres/));
    await waitFor(() => {
      expect(view.getByText(/Okoumé/)).toBeTruthy();
    });
  });

  it("renders SpeciesDetailScreen from cache instantly", async () => {
    const view = render(<SpeciesDetailScreen name="Aucoumea klaineana" onBack={() => undefined} />);
    await waitFor(() => {
      expect(view.getByText(/Okoumé/)).toBeTruthy();
    });
  });

  it("renders LoginScreen with fingerprint verify affordance", () => {
    const view = render(<LoginScreen onLogin={() => undefined} />);
    expect(view.getByTestId("verify-button")).toBeTruthy();
  });
});
