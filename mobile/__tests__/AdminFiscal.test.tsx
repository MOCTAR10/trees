import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";
import * as pdf from "../src/pdf";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import AdminFiscal from "../src/components/AdminFiscal";

const mocked = client as jest.Mocked<typeof client>;
const mockedPdf = pdf as jest.Mocked<typeof pdf>;

const TITLES: client.ForestTitle[] = [
  {
    id: 30,
    title_type: "CFAD",
    reference: "T-1",
    surface_ha: 1000,
    status: "actif",
    created_at: "2026-01-01",
  },
];

const DUES: client.TaxDue[] = [
  {
    id: 1,
    org_id: 10,
    org_name: "Bois SA",
    title_id: 30,
    title_ref: "T-1",
    tax_type: "superficie",
    period_year: 2026,
    amount_fcfa: 1_500_000,
    due_at: "2026-06-30",
    notes: null,
    receipt_id: null,
    receipt_ref: null,
    paid_at: null,
    status: "du",
    surcharge_fcfa: 0,
    created_at: "2026-01-02T10:00:00",
  },
];

const AGREEMENTS: client.CommunityAgreement[] = [
  {
    id: 5,
    title_id: 30,
    title_ref: "T-1",
    community_org_id: 40,
    community_name: "Village Mbe",
    ccc_ref: "CCC-1",
    ccc_signed_at: "2026-02-01",
    fdl_rate_fcfa_m3: 800,
    annual_volume_m3: 1000,
    contribution_fcfa: 800_000,
    cgsp_minutes_document_id: null,
    status: "actif",
    created_at: "2026-02-01T10:00:00",
  },
];

const DILIGENCE: client.EudrDiligence[] = [
  {
    id: 7,
    org_id: 10,
    org_name: "Bois SA",
    title_id: 30,
    title_ref: "T-1",
    parcel_label: "Parcelle Nord",
    parcel_wkt: "POLYGON((0 0, 1 0, 1 1, 0 0))",
    consultation_document_id: null,
    geolocated_stem_count: 2,
    felled_stem_count: 3,
    declared_volume_m3: 42,
    notes: null,
    status: "soumis",
    decision_motif: null,
    decided_at: null,
    created_at: "2026-03-01T10:00:00",
  },
];

const SUMMARY: client.CommunitySummary = {
  by_status: [{ status: "actif", count: 1, contribution_fcfa: 800_000 }],
  total_count: 1,
  total_contribution_fcfa: 800_000,
};

describe("AdminFiscal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.listTitles.mockResolvedValue(TITLES);
    mocked.listTaxDues.mockResolvedValue(DUES);
    mocked.listCommunityAgreements.mockResolvedValue(AGREEMENTS);
    mocked.communitySummary.mockResolvedValue(SUMMARY);
    mocked.listEudrDiligence.mockResolvedValue(DILIGENCE);
    mockedPdf.exportDiligencePdf.mockResolvedValue("file://diligence.pdf");
    mockedPdf.sharePdf.mockResolvedValue(undefined);
  });

  it("declares a tax due for a title", async () => {
    mocked.createTaxDue.mockResolvedValue(DUES[0]);

    const { getByTestId, getByPlaceholderText } = render(<AdminFiscal />);
    await waitFor(() => expect(getByTestId("new-due")).toBeTruthy());

    fireEvent.press(getByTestId("new-due"));
    await waitFor(() => expect(getByTestId("title-30")).toBeTruthy());
    fireEvent.press(getByTestId("title-30"));
    fireEvent.changeText(getByPlaceholderText("Montant (FCFA)"), "1500000");
    fireEvent.press(getByTestId("due-submit"));

    await waitFor(() =>
      expect(mocked.createTaxDue).toHaveBeenCalledWith(
        expect.objectContaining({
          title_id: 30,
          tax_type: "superficie",
          amount_fcfa: 1_500_000,
        }),
      ),
    );
  });

  it("decides a CCC/FDL agreement", async () => {
    mocked.decideCommunityAgreement.mockResolvedValue({ ...AGREEMENTS[0], status: "suspendu" });

    const { getByTestId } = render(<AdminFiscal />);
    fireEvent.press(getByTestId("seg-ccc"));
    await waitFor(() => expect(getByTestId("decide-agreement-5")).toBeTruthy());

    fireEvent.press(getByTestId("decide-agreement-5"));
    fireEvent.press(getByTestId("agreement-status-suspendu"));
    fireEvent.press(getByTestId("agreement-decision-submit"));

    await waitFor(() =>
      expect(mocked.decideCommunityAgreement).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ status: "suspendu" }),
      ),
    );
  });

  it("rejects an EUDR diligence with a motif", async () => {
    mocked.decideEudrDiligence.mockResolvedValue({
      ...DILIGENCE[0],
      status: "rejete",
      decision_motif: "Parcelle incomplète",
    });

    const { getByTestId, getByPlaceholderText } = render(<AdminFiscal />);
    fireEvent.press(getByTestId("seg-eudr"));
    await waitFor(() => expect(getByTestId("decide-diligence-7")).toBeTruthy());

    fireEvent.press(getByTestId("decide-diligence-7"));
    fireEvent.press(getByTestId("eudr-status-rejete"));
    fireEvent.changeText(getByPlaceholderText("Motif"), "Parcelle incomplète");
    fireEvent.press(getByTestId("eudr-decision-submit"));

    await waitFor(() =>
      expect(mocked.decideEudrDiligence).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ status: "rejete", motif: "Parcelle incomplète" }),
      ),
    );
  });

  it("exports an EUDR diligence PDF", async () => {
    const { getByTestId } = render(<AdminFiscal />);
    fireEvent.press(getByTestId("seg-eudr"));
    await waitFor(() => expect(getByTestId("diligence-pdf-7")).toBeTruthy());

    fireEvent.press(getByTestId("diligence-pdf-7"));
    await waitFor(() => expect(mockedPdf.exportDiligencePdf).toHaveBeenCalledWith(7));
    expect(mockedPdf.sharePdf).toHaveBeenCalledWith("file://diligence.pdf");
  });
});
