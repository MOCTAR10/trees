import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import AdminCertifications from "../src/components/AdminCertifications";

const mocked = client as jest.Mocked<typeof client>;

const summary = {
  by_status: [{ status: "soumis" as const, count: 1, surface_ha: 5000 }],
  by_scheme: [{ scheme: "FSC" as const, count: 1 }],
  total_count: 1,
};

const submitted = {
  id: 900,
  org_id: 10,
  org_name: "Bois SA",
  title_id: null,
  title_ref: null,
  scheme: "FSC" as const,
  cert_type: "gestion_durable" as const,
  certificate_ref: "FSC-C-001",
  surface_ha: 5000,
  valid_from: null,
  valid_to: null,
  status: "soumis" as const,
  created_at: "now",
};

describe("AdminCertifications", () => {
  beforeEach(() => jest.clearAllMocks());

  it("verifies a submitted certification", async () => {
    mocked.listCertifications.mockResolvedValue([submitted]);
    mocked.certificationSummary.mockResolvedValue(summary);
    mocked.decideCertification.mockResolvedValue({ ...submitted, status: "actif" });

    const { getByText, getByTestId } = render(<AdminCertifications />);
    await waitFor(() => expect(getByText("FSC · Bois SA")).toBeTruthy());

    fireEvent.press(getByTestId("cert-verify-900"));
    await waitFor(() => expect(mocked.decideCertification).toHaveBeenCalledWith(900, "actif", null));
  });

  it("requires a motif before rejecting", async () => {
    mocked.listCertifications.mockResolvedValue([submitted]);
    mocked.certificationSummary.mockResolvedValue(summary);
    mocked.decideCertification.mockResolvedValue({ ...submitted, status: "rejete" });

    const { getByText, getByTestId, getByPlaceholderText } = render(<AdminCertifications />);
    await waitFor(() => expect(getByText("FSC · Bois SA")).toBeTruthy());

    fireEvent.press(getByTestId("cert-reject-900"));
    fireEvent.press(getByTestId("cert-motif-submit"));
    expect(mocked.decideCertification).not.toHaveBeenCalled();
    expect(getByText("Motif requis.")).toBeTruthy();

    fireEvent.changeText(
      getByPlaceholderText("Motif (requis pour un rejet / une suspension)"),
      "Certificat expiré",
    );
    fireEvent.press(getByTestId("cert-motif-submit"));

    await waitFor(() =>
      expect(mocked.decideCertification).toHaveBeenCalledWith(900, "rejete", "Certificat expiré"),
    );
  });
});
