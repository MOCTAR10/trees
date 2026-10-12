import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");

import CompanyTitles from "../src/components/CompanyTitles";

const mocked = client as jest.Mocked<typeof client>;

describe("CompanyTitles", () => {
  beforeEach(() => jest.clearAllMocks());

  it("drills from a title to its UFA and AAC, then submits a PAO", async () => {
    mocked.listTitles.mockResolvedValue([
      {
        id: 30,
        title_type: "CFAD",
        reference: "T-1",
        surface_ha: 5000,
        status: "actif",
        created_at: "now",
      },
    ]);
    mocked.listUnits.mockResolvedValue([
      {
        id: 60,
        title_id: 30,
        label: "UFA-1",
        surface_ha: 100,
        plan_amenagement_ref: null,
        created_at: "now",
      },
    ]);
    mocked.listAacs.mockResolvedValue([
      {
        id: 40,
        ufa_id: 60,
        label: "AAC-2026",
        campaign_year: 2026,
        surface_ha: 10,
        possibility_m3: 100,
        origin: "plan_amenagement",
        status: "prepare",
        pao_reference: null,
      },
    ]);
    mocked.actOnAac.mockResolvedValue({ id: 40, status: "soumis" });

    const { getByText, getByTestId, getByPlaceholderText } = render(<CompanyTitles />);
    await waitFor(() => expect(getByText("CFAD · T-1")).toBeTruthy());

    fireEvent.press(getByTestId("title-30"));
    await waitFor(() => expect(getByText("UFA-1")).toBeTruthy());

    fireEvent.press(getByTestId("unit-60"));
    await waitFor(() => expect(getByText("AAC-2026")).toBeTruthy());

    fireEvent.press(getByTestId("pao-40"));
    fireEvent.changeText(getByPlaceholderText("Référence du PAO"), "PAO-1");
    fireEvent.press(getByTestId("pao-submit"));

    await waitFor(() =>
      expect(mocked.actOnAac).toHaveBeenCalledWith(40, {
        action: "soumettre_pao",
        pao_reference: "PAO-1",
      }),
    );
  });

  it("requests a new title", async () => {
    mocked.listTitles.mockResolvedValue([]);
    mocked.requestTitle.mockResolvedValue({
      id: 31,
      title_type: "PFA",
      reference: "NEW-1",
      surface_ha: 200,
      status: "demande",
      created_at: "now",
    });

    const { getByText, getByTestId, getByPlaceholderText } = render(<CompanyTitles />);
    await waitFor(() => expect(getByText("Aucun titre enregistré.")).toBeTruthy());

    fireEvent.press(getByTestId("new-title"));
    fireEvent.changeText(getByPlaceholderText("Référence"), "NEW-1");
    fireEvent.press(getByTestId("title-submit"));

    await waitFor(() => expect(mocked.requestTitle).toHaveBeenCalledTimes(1));
    expect(mocked.requestTitle).toHaveBeenCalledWith(
      expect.objectContaining({ title_type: "CFAD", reference: "NEW-1", zone: "permanent" }),
    );
  });
});
