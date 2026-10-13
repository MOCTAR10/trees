import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import EudrStems from "../src/components/EudrStems";

const mocked = client as jest.Mocked<typeof client>;

const inside = {
  tree_code: "GA-2026-000001",
  species_scientific_name: "Aucoumea klaineana",
  status: "abattu",
  latitude: 11.45,
  longitude: -0.25,
  inside: true,
};

const outside = {
  tree_code: "GA-2026-000006",
  species_scientific_name: "Terminalia superba",
  status: "abattu",
  latitude: 11.7,
  longitude: -0.05,
  inside: false,
};

describe("EudrStems", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads and lists the per-log geolocation on demand", async () => {
    mocked.listDiligenceStems.mockResolvedValue([inside, outside]);

    const { getByText, getByTestId, queryByTestId } = render(<EudrStems diligenceId={1} />);
    // Nothing is fetched until the operator asks to verify the geolocation.
    expect(mocked.listDiligenceStems).not.toHaveBeenCalled();
    expect(queryByTestId("eudr-stem-GA-2026-000001")).toBeNull();

    fireEvent.press(getByTestId("eudr-stems-1"));

    await waitFor(() => expect(getByTestId("eudr-stem-GA-2026-000001")).toBeTruthy());
    expect(mocked.listDiligenceStems).toHaveBeenCalledWith(1);
    expect(getByText("Dans la parcelle")).toBeTruthy();
    expect(getByText("Hors parcelle")).toBeTruthy();
    // The list can be hidden again without refetching.
    fireEvent.press(getByTestId("eudr-stems-1"));
    await waitFor(() => expect(queryByTestId("eudr-stem-GA-2026-000001")).toBeNull());
    expect(mocked.listDiligenceStems).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when no stem is geolocated", async () => {
    mocked.listDiligenceStems.mockResolvedValue([]);

    const { getByText, getByTestId } = render(<EudrStems diligenceId={2} />);
    fireEvent.press(getByTestId("eudr-stems-2"));

    await waitFor(() =>
      expect(getByText("Aucune grume géolocalisée pour cette déclaration.")).toBeTruthy(),
    );
  });

  it("surfaces a loading error", async () => {
    mocked.listDiligenceStems.mockRejectedValue(new Error("EUDR stems 500"));

    const { getByText, getByTestId } = render(<EudrStems diligenceId={3} />);
    fireEvent.press(getByTestId("eudr-stems-3"));

    await waitFor(() => expect(getByText("EUDR stems 500")).toBeTruthy());
  });
});
