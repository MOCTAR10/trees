import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import UfaDme from "../src/components/UfaDme";

const mocked = client as jest.Mocked<typeof client>;

const provisional: client.UfaDmeView = {
  ufa_id: 60,
  title_id: 30,
  label: "UFA-3",
  entries: [
    {
      species_scientific_name: "Aucoumea klaineana",
      dme_cm: 70,
      source: "seuil provisoire",
      origin: "provisional",
    },
  ],
};

const withOverride: client.UfaDmeView = {
  ...provisional,
  entries: [
    {
      species_scientific_name: "Aucoumea klaineana",
      dme_cm: 90,
      source: "Arrêté 0001/MEF — DME UFA-3",
      origin: "ufa",
    },
  ],
};

describe("UfaDme", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists the effective matrix with its origin", async () => {
    mocked.getUfaDme.mockResolvedValue(provisional);
    const { getByText } = render(<UfaDme ufaId={60} mode="admin" />);
    await waitFor(() => expect(getByText("Aucoumea klaineana")).toBeTruthy());
    expect(getByText("Provisoire")).toBeTruthy();
    expect(getByText("DME (cm) : 70")).toBeTruthy();
  });

  it("lets the Ministry fix a species DME for the UFA", async () => {
    mocked.getUfaDme.mockResolvedValue(provisional);
    mocked.setUfaDme.mockResolvedValue(withOverride);
    const { getByTestId, getByText } = render(<UfaDme ufaId={60} mode="admin" />);
    await waitFor(() => expect(getByTestId("dme-fix-60-Aucoumea klaineana")).toBeTruthy());

    fireEvent.press(getByTestId("dme-fix-60-Aucoumea klaineana"));
    fireEvent.changeText(getByTestId("dme-input"), "90");
    fireEvent.changeText(getByTestId("dme-source"), "Arrêté 0001/MEF — DME UFA-3");
    fireEvent.press(getByTestId("dme-save"));

    await waitFor(() =>
      expect(mocked.setUfaDme).toHaveBeenCalledWith(60, [
        {
          species_scientific_name: "Aucoumea klaineana",
          dme_cm: 90,
          source: "Arrêté 0001/MEF — DME UFA-3",
        },
      ]),
    );
    await waitFor(() => expect(getByText("DME de l'UFA enregistré.")).toBeTruthy());
    expect(getByText("Arrêté UFA")).toBeTruthy();
  });

  it("rejects an out-of-range diameter", async () => {
    mocked.getUfaDme.mockResolvedValue(provisional);
    const { getByTestId, getByText } = render(<UfaDme ufaId={60} mode="admin" />);
    await waitFor(() => expect(getByTestId("dme-fix-60-Aucoumea klaineana")).toBeTruthy());

    fireEvent.press(getByTestId("dme-fix-60-Aucoumea klaineana"));
    fireEvent.changeText(getByTestId("dme-input"), "900");
    fireEvent.press(getByTestId("dme-save"));

    await waitFor(() => expect(getByText("DME invalide (0 < cm ≤ 400).")).toBeTruthy());
    expect(mocked.setUfaDme).not.toHaveBeenCalled();
  });

  it("lets the Ministry clear an override back to provisional", async () => {
    mocked.getUfaDme.mockResolvedValue(withOverride);
    mocked.clearUfaDme.mockResolvedValue(provisional);
    const { getByTestId, getByText } = render(<UfaDme ufaId={60} mode="admin" />);
    await waitFor(() => expect(getByTestId("dme-reset-60-Aucoumea klaineana")).toBeTruthy());

    fireEvent.press(getByTestId("dme-reset-60-Aucoumea klaineana"));

    await waitFor(() => expect(mocked.clearUfaDme).toHaveBeenCalledWith(60, "Aucoumea klaineana"));
    await waitFor(() => expect(getByText("Seuil provisoire rétabli.")).toBeTruthy());
  });

  it("is read-only for companies", async () => {
    mocked.getUfaDme.mockResolvedValue(withOverride);
    const { getByText, queryByTestId } = render(<UfaDme ufaId={60} mode="company" />);
    await waitFor(() => expect(getByText("Aucoumea klaineana")).toBeTruthy());
    expect(queryByTestId("dme-reset-60-Aucoumea klaineana")).toBeNull();
    expect(queryByTestId("dme-fix-60-Aucoumea klaineana")).toBeNull();
  });
});
