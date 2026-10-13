import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import AdminAnomalies from "../src/components/AdminAnomalies";

const mocked = client as jest.Mocked<typeof client>;

const item = {
  type: "below_dme" as const,
  severity: "hard" as const,
  label: "Arbre abattu sous le diamètre minimum (DME)",
  subject_key: "GA-DME-1",
  subject: "GA-DME-1",
  detail: "DBH 40 cm < DME 60 cm",
  org_id: 10,
  org_name: "Bois SA",
  title_id: 3,
  title_ref: "CFAD-1",
  aac_id: 7,
  aac_label: "AAC-2026",
  detected_at: "2026-01-02T10:00:00+00:00",
  review_status: "ouverte" as const,
  review_motif: null,
};

const summary = {
  total: 1,
  hard: 1,
  warning: 0,
  ouvertes: 1,
  by_type: [
    {
      type: "below_dme" as const,
      label: item.label,
      severity: "hard" as const,
      count: 1,
      ouvertes: 1,
    },
  ],
};

describe("AdminAnomalies", () => {
  beforeEach(() => jest.clearAllMocks());

  it("acknowledges a detected anomaly", async () => {
    mocked.listAdminAnomalies.mockResolvedValue([item]);
    mocked.anomalySummary.mockResolvedValue(summary);
    mocked.reviewAnomaly.mockResolvedValue({
      anomaly_type: "below_dme",
      subject_key: "GA-DME-1",
      status: "traitee",
      decision_motif: null,
    });

    const { getByText, getByTestId } = render(<AdminAnomalies />);
    await waitFor(() =>
      expect(getByText("GA-DME-1 — DBH 40 cm < DME 60 cm")).toBeTruthy(),
    );

    fireEvent.press(getByTestId("anomaly-ack-below_dme-GA-DME-1-0"));
    await waitFor(() =>
      expect(mocked.reviewAnomaly).toHaveBeenCalledWith(
        expect.objectContaining({
          anomaly_type: "below_dme",
          subject_key: "GA-DME-1",
          status: "traitee",
        }),
      ),
    );
  });

  it("requires a motif before dismissing", async () => {
    mocked.listAdminAnomalies.mockResolvedValue([item]);
    mocked.anomalySummary.mockResolvedValue(summary);
    mocked.reviewAnomaly.mockResolvedValue({
      anomaly_type: "below_dme",
      subject_key: "GA-DME-1",
      status: "ecartee",
      decision_motif: "Erreur de mesure",
    });

    const { getByText, getByTestId, getByPlaceholderText } = render(<AdminAnomalies />);
    await waitFor(() => expect(getByText("GA-DME-1 — DBH 40 cm < DME 60 cm")).toBeTruthy());

    fireEvent.press(getByTestId("anomaly-dismiss-below_dme-GA-DME-1-0"));
    fireEvent.press(getByTestId("anomaly-motif-submit"));
    expect(mocked.reviewAnomaly).not.toHaveBeenCalled();
    expect(getByText("Motif requis.")).toBeTruthy();

    fireEvent.changeText(
      getByPlaceholderText("Motif (requis pour écarter)"),
      "Erreur de mesure confirmée",
    );
    fireEvent.press(getByTestId("anomaly-motif-submit"));

    await waitFor(() =>
      expect(mocked.reviewAnomaly).toHaveBeenCalledWith(
        expect.objectContaining({
          anomaly_type: "below_dme",
          subject_key: "GA-DME-1",
          status: "ecartee",
          decision_motif: "Erreur de mesure confirmée",
        }),
      ),
    );
  });
});
