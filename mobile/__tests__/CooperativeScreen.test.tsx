import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "denied" })),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock("../src/api/client", () => ({
  cooperativeResidues: jest.fn(async () => ({
    profile_type: "menuiserie",
    count: 1,
    residues: [
      {
        id: 3,
        species_scientific_name: "Aucoumea klaineana",
        distance_km: 482.3,
        relevant_mass_kg: 950,
        match_score: 0.8,
        status: "available",
        assigned_to_me: false,
      },
    ],
  })),
  collectResidue: jest.fn(),
}));

import * as client from "../src/api/client";
import CooperativeScreen from "../src/screens/CooperativeScreen";

const user = { id: 9, email: "c@x", role: "cooperative" } as any;

describe("CooperativeScreen", () => {
  it("lists residues and widens the search to the whole country", async () => {
    const { getByText } = render(<CooperativeScreen user={user} onLogout={jest.fn()} showHeader={false} />);
    await waitFor(() => expect(getByText("Aucoumea klaineana")).toBeTruthy());
    expect(client.cooperativeResidues).toHaveBeenLastCalledWith(0.4162, 9.4541, { radiusKm: 150, onlyMatching: false });
    fireEvent.press(getByText("Tout le Gabon"));
    await waitFor(() =>
      expect(client.cooperativeResidues).toHaveBeenLastCalledWith(0.4162, 9.4541, { radiusKm: 1000, onlyMatching: false }),
    );
    expect(getByText("482,3 km")).toBeTruthy();
  });
});
