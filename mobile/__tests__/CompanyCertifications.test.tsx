import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import CompanyCertifications from "../src/components/CompanyCertifications";

const mocked = client as jest.Mocked<typeof client>;

const declared = {
  id: 900,
  org_id: 10,
  title_id: null,
  scheme: "FSC" as const,
  cert_type: "gestion_durable" as const,
  certificate_ref: "FSC-C-001",
  surface_ha: 5000,
  valid_from: null,
  valid_to: null,
  status: "soumis" as const,
  created_at: "now",
};

describe("CompanyCertifications", () => {
  beforeEach(() => jest.clearAllMocks());

  it("declares a certification", async () => {
    mocked.listCertifications.mockResolvedValue([]);
    mocked.myTitles.mockResolvedValue([]);
    mocked.declareCertification.mockResolvedValue(declared);

    const { getByText, getByTestId } = render(<CompanyCertifications />);
    await waitFor(() => expect(getByText("Aucune certification déclarée.")).toBeTruthy());

    fireEvent.press(getByTestId("cert-new"));
    fireEvent.press(getByTestId("cert-scheme-PAFC"));
    fireEvent.press(getByTestId("cert-submit"));

    await waitFor(() =>
      expect(mocked.declareCertification).toHaveBeenCalledWith(
        expect.objectContaining({ scheme: "PAFC", cert_type: "gestion_durable" }),
      ),
    );
  });

  it("lists a declared certification with its status and reference", async () => {
    mocked.listCertifications.mockResolvedValue([{ ...declared, status: "actif" }]);
    mocked.myTitles.mockResolvedValue([]);

    const { getByText } = render(<CompanyCertifications />);
    await waitFor(() => expect(getByText("Actif")).toBeTruthy());
    expect(getByText("Référence du certificat : FSC-C-001")).toBeTruthy();
  });
});
