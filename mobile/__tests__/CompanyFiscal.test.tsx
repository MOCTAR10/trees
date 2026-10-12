import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";
import * as pdf from "../src/pdf";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import CompanyFiscal from "../src/components/CompanyFiscal";

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

describe("CompanyFiscal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.myTitles.mockResolvedValue(TITLES);
    mocked.listCommunities.mockResolvedValue([{ id: 40, name: "Village Mbe", address: null }]);
    mocked.listTaxDues.mockResolvedValue(DUES);
    mocked.listCommunityAgreements.mockResolvedValue(AGREEMENTS);
    mocked.listEudrDiligence.mockResolvedValue(DILIGENCE);
    mockedPdf.exportDiligencePdf.mockResolvedValue("file://diligence.pdf");
    mockedPdf.sharePdf.mockResolvedValue(undefined);
  });

  it("lists dues and settles one with a receipt", async () => {
    mocked.settleTaxDue.mockResolvedValue({ ...DUES[0], status: "paye", receipt_ref: "Q-1" });

    const { getByText, getByTestId } = render(<CompanyFiscal />);
    await waitFor(() => expect(getByText("Taxe de superficie · 2026")).toBeTruthy());

    fireEvent.press(getByTestId("settle-1"));
    fireEvent.press(getByTestId("settle-submit"));

    await waitFor(() =>
      expect(mocked.settleTaxDue).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ amount_fcfa: 1_500_000 }),
      ),
    );
  });

  it("creates a CCC/FDL agreement for a title and community", async () => {
    mocked.createCommunityAgreement.mockResolvedValue(AGREEMENTS[0]);

    const { getByTestId } = render(<CompanyFiscal />);
    fireEvent.press(getByTestId("seg-ccc"));
    await waitFor(() => expect(getByTestId("new-agreement")).toBeTruthy());

    fireEvent.press(getByTestId("new-agreement"));
    await waitFor(() => expect(getByTestId("title-30")).toBeTruthy());
    fireEvent.press(getByTestId("title-30"));
    fireEvent.press(getByTestId("agreement-submit"));

    await waitFor(() =>
      expect(mocked.createCommunityAgreement).toHaveBeenCalledWith(
        expect.objectContaining({
          title_id: 30,
          community_org_id: 40,
          fdl_rate_fcfa_m3: 800,
        }),
      ),
    );
  });

  it("submits an EUDR diligence with a parcel label", async () => {
    mocked.listEudrDiligence.mockResolvedValue([]);
    mocked.createEudrDiligence.mockResolvedValue(DILIGENCE[0]);

    const { getByTestId, getByPlaceholderText } = render(<CompanyFiscal />);
    fireEvent.press(getByTestId("seg-eudr"));
    await waitFor(() => expect(getByTestId("new-diligence")).toBeTruthy());

    fireEvent.press(getByTestId("new-diligence"));
    fireEvent.changeText(getByPlaceholderText("Parcelle d'origine"), "Parcelle Nord");
    fireEvent.press(getByTestId("diligence-submit"));

    await waitFor(() =>
      expect(mocked.createEudrDiligence).toHaveBeenCalledWith(
        expect.objectContaining({ parcel_label: "Parcelle Nord" }),
      ),
    );
  });

  it("exports an EUDR diligence PDF", async () => {
    const { getByTestId } = render(<CompanyFiscal />);
    fireEvent.press(getByTestId("seg-eudr"));
    await waitFor(() => expect(getByTestId("diligence-pdf-7")).toBeTruthy());

    fireEvent.press(getByTestId("diligence-pdf-7"));
    await waitFor(() => expect(mockedPdf.exportDiligencePdf).toHaveBeenCalledWith(7));
    expect(mockedPdf.sharePdf).toHaveBeenCalledWith("file://diligence.pdf");
  });
});
