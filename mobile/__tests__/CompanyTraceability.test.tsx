import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";
import * as pdf from "../src/pdf";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import CompanyTraceability from "../src/components/CompanyTraceability";

const mocked = client as jest.Mocked<typeof client>;
const mockedPdf = pdf as jest.Mocked<typeof pdf>;

const DF10 = [
  {
    tree_code: "GA-1",
    species_scientific_name: "Aucoumea klaineana",
    measured_dbh_cm: 80,
    marking_type: "qr",
    status: "declare",
    hammer_mark: "M-1",
    felled_at: null,
    df10_entry_no: null,
    abandon_code: null,
    abandon_label: null,
    df10_notes: null,
    permit_number: "P-1",
    aac_label: "AAC-1",
    title_id: 30,
    aac_id: 40,
  },
];

const DOCS = [
  {
    id: 1,
    org_id: 10,
    doc_type: "bordereau_roulage" as const,
    reference: "BDR-ABC",
    from_label: "AAC-1",
    to_label: "Port",
    tree_codes: ["GA-1"],
    volume_m3: 4.21,
    status: "brouillon" as const,
    transporter: null,
    vehicle_ref: null,
    title_id: null,
    aac_id: null,
    created_at: "now",
  },
];

describe("CompanyTraceability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.listDf10.mockResolvedValue(DF10);
    mocked.listTransportDocuments.mockResolvedValue(DOCS);
    mockedPdf.exportDf10Pdf.mockResolvedValue("file://df10.pdf");
    mockedPdf.exportTransportPdf.mockResolvedValue("file://transport.pdf");
    mockedPdf.sharePdf.mockResolvedValue(undefined);
  });

  it("lists the DF10 register and records an abandonment", async () => {
    mocked.setDf10Abandon.mockResolvedValue({ ...DF10[0], abandon_code: "creux" });

    const { getByText, getByTestId } = render(<CompanyTraceability />);
    await waitFor(() => expect(getByText("GA-1")).toBeTruthy());

    fireEvent.press(getByTestId("abandon-GA-1"));
    fireEvent.press(getByTestId("abandon-submit"));

    await waitFor(() =>
      expect(mocked.setDf10Abandon).toHaveBeenCalledWith("GA-1", {
        abandon_code: "creux",
        notes: null,
      }),
    );
  });

  it("creates a transport document from tree codes", async () => {
    mocked.createTransportDocument.mockResolvedValue(DOCS[0]);

    const { getByTestId, getByPlaceholderText } = render(<CompanyTraceability />);
    fireEvent.press(getByTestId("seg-transport"));
    await waitFor(() => expect(getByTestId("new-transport")).toBeTruthy());

    fireEvent.press(getByTestId("new-transport"));
    fireEvent.changeText(
      getByPlaceholderText("Codes arbres (séparés par des virgules)"),
      "GA-1, GA-2",
    );
    fireEvent.press(getByTestId("transport-submit"));

    await waitFor(() =>
      expect(mocked.createTransportDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          doc_type: "bordereau_roulage",
          tree_codes: ["GA-1", "GA-2"],
        }),
      ),
    );
  });

  it("advances a document and exports its PDF", async () => {
    mocked.actOnTransportDocument.mockResolvedValue({ ...DOCS[0], status: "emis" });

    const { getByTestId } = render(<CompanyTraceability />);
    fireEvent.press(getByTestId("seg-transport"));
    await waitFor(() => expect(getByTestId("transport-advance-1")).toBeTruthy());

    fireEvent.press(getByTestId("transport-advance-1"));
    await waitFor(() =>
      expect(mocked.actOnTransportDocument).toHaveBeenCalledWith(1, "emis"),
    );

    fireEvent.press(getByTestId("transport-pdf-1"));
    await waitFor(() => expect(mockedPdf.exportTransportPdf).toHaveBeenCalledWith(1));
    expect(mockedPdf.sharePdf).toHaveBeenCalledWith("file://transport.pdf");
  });

  it("exports the DF10 carnet as PDF", async () => {
    const { getByTestId } = render(<CompanyTraceability />);
    await waitFor(() => expect(getByTestId("export-df10")).toBeTruthy());

    fireEvent.press(getByTestId("export-df10"));
    await waitFor(() => expect(mockedPdf.exportDf10Pdf).toHaveBeenCalled());
    expect(mockedPdf.sharePdf).toHaveBeenCalledWith("file://df10.pdf");
  });
});
