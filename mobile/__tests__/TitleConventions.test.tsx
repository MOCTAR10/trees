import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";
import * as pdf from "../src/pdf";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import TitleConventions from "../src/components/TitleConventions";

const mocked = client as jest.Mocked<typeof client>;
const mockedPdf = pdf as jest.Mocked<typeof pdf>;

const provisoire = {
  id: 501,
  title_id: 30,
  convention_type: "provisoire" as const,
  reference: "CONV-PROV-01",
  signed_at: "2024-01-10",
  start_date: "2024-01-10",
  end_date: "2029-01-10",
  surface_ha: 60000,
  status: "active" as const,
  attestation_ref: null,
  attestation_issued_at: null,
  created_at: "now",
};

const definitive = {
  ...provisoire,
  id: 502,
  convention_type: "definitive" as const,
  reference: "CONV-DEF-01",
  end_date: "2041-01-10",
};

describe("TitleConventions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists the conventions for a company and exports the PDF", async () => {
    mocked.listConventions.mockResolvedValue([provisoire, definitive]);
    mockedPdf.exportConventionPdf.mockResolvedValue("convention_501.pdf");

    const { getByText, getByTestId, queryByTestId } = render(
      <TitleConventions titleId={30} mode="company" />,
    );
    await waitFor(() => expect(getByText("Convention provisoire")).toBeTruthy());
    expect(getByText("Convention définitive")).toBeTruthy();
    // A company cannot record or close a convention.
    expect(queryByTestId("conv-add-provisoire")).toBeNull();

    fireEvent.press(getByTestId("conv-pdf-501"));
    await waitFor(() => expect(mockedPdf.exportConventionPdf).toHaveBeenCalledWith(30, 501));
  });

  it("shows an empty state when no convention is recorded", async () => {
    mocked.listConventions.mockResolvedValue([]);
    const { getByText } = render(<TitleConventions titleId={30} mode="company" />);
    await waitFor(() => expect(getByText("Aucune convention enregistrée.")).toBeTruthy());
  });

  it("lets the Ministry record a definitive convention", async () => {
    mocked.listConventions.mockResolvedValue([]);
    mocked.createConvention.mockResolvedValue(definitive);

    const { getByTestId } = render(<TitleConventions titleId={30} mode="admin" />);
    await waitFor(() => expect(getByTestId("conv-add-definitive")).toBeTruthy());

    fireEvent.press(getByTestId("conv-add-definitive"));
    fireEvent.changeText(getByTestId("conv-reference"), "CONV-DEF-01");
    fireEvent.press(getByTestId("conv-submit"));

    await waitFor(() =>
      expect(mocked.createConvention).toHaveBeenCalledWith(
        30,
        expect.objectContaining({
          convention_type: "definitive",
          reference: "CONV-DEF-01",
        }),
      ),
    );
  });

  it("lets the Ministry issue the attestation de conformité", async () => {
    mocked.listConventions.mockResolvedValue([provisoire]);
    mocked.issueAttestation.mockResolvedValue({
      id: 501,
      title_id: 30,
      attestation_ref: "ATT-2026-01",
      attestation_issued_at: "2026-06-01",
    });

    const { getByTestId } = render(<TitleConventions titleId={30} mode="admin" />);
    await waitFor(() => expect(getByTestId("conv-attest-501")).toBeTruthy());

    fireEvent.press(getByTestId("conv-attest-501"));
    fireEvent.changeText(getByTestId("conv-attest-ref"), "ATT-2026-01");
    fireEvent.press(getByTestId("conv-attest-submit"));

    await waitFor(() =>
      expect(mocked.issueAttestation).toHaveBeenCalledWith(30, 501, "ATT-2026-01"),
    );
  });

  it("requires a motif before closing a convention", async () => {
    mocked.listConventions.mockResolvedValue([definitive]);
    mocked.decideConvention.mockResolvedValue({ id: 502, title_id: 30, status: "resiliee" });

    const { getByText, getByTestId } = render(<TitleConventions titleId={30} mode="admin" />);
    await waitFor(() => expect(getByTestId("conv-terminate-502")).toBeTruthy());

    fireEvent.press(getByTestId("conv-terminate-502"));
    fireEvent.press(getByTestId("conv-terminate-submit"));
    expect(mocked.decideConvention).not.toHaveBeenCalled();
    expect(getByText("Motif requis.")).toBeTruthy();

    fireEvent.changeText(getByTestId("conv-terminate-motif"), "Manquement aux obligations");
    fireEvent.press(getByTestId("conv-terminate-submit"));

    await waitFor(() =>
      expect(mocked.decideConvention).toHaveBeenCalledWith(
        30,
        502,
        "resiliee",
        "Manquement aux obligations",
      ),
    );
  });
});
