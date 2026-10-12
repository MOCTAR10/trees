import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";
import * as pdf from "../src/pdf";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import AdminTraceability from "../src/components/AdminTraceability";

const mocked = client as jest.Mocked<typeof client>;
const mockedPdf = pdf as jest.Mocked<typeof pdf>;

const DF10 = [
  {
    tree_code: "GA-1",
    species_scientific_name: "Aucoumea klaineana",
    measured_dbh_cm: 80,
    marking_type: "qr",
    status: "abattu",
    hammer_mark: "M-1",
    felled_at: "2026-03-01T10:00:00",
    df10_entry_no: "DF10-2026-000001",
    abandon_code: null,
    abandon_label: null,
    df10_notes: null,
    permit_number: "P-1",
    aac_label: "AAC-1",
    title_id: 30,
    aac_id: 40,
  },
];

const STATEMENT = {
  period: { year: 2026, quarter: null },
  totals: { stems_felled: 3, estimated_volume_m3: 9.5, by_status: { abattu: 3 } },
  by_species: [{ species: "Aucoumea klaineana", stems: 3, volume_m3: 9.5 }],
  transformation_rate: 0.5,
  abandoned: [{ code: "creux", label: "Creux / cœur pourri", count: 1 }],
  transport: { documents: 2, volume_m3: 5.19 },
};

describe("AdminTraceability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.listDf10.mockResolvedValue(DF10);
    mocked.getStatement.mockResolvedValue(STATEMENT);
    mockedPdf.exportDf10Pdf.mockResolvedValue("file://df10.pdf");
    mockedPdf.exportStatementPdf.mockResolvedValue("file://etat.pdf");
    mockedPdf.sharePdf.mockResolvedValue(undefined);
  });

  it("lists the national DF10 register and exports it", async () => {
    const { getByTestId, getByText } = render(<AdminTraceability />);
    await waitFor(() => expect(getByText("DF10-2026-000001 · GA-1")).toBeTruthy());

    fireEvent.press(getByTestId("export-df10"));
    await waitFor(() => expect(mockedPdf.exportDf10Pdf).toHaveBeenCalled());
    expect(mockedPdf.sharePdf).toHaveBeenCalledWith("file://df10.pdf");
  });

  it("loads a statement for the year and a quarter", async () => {
    const year = String(new Date().getFullYear());
    const { getByTestId, getByText } = render(<AdminTraceability />);
    fireEvent.press(getByTestId("seg-statements"));

    fireEvent.press(getByTestId("load-statement"));
    await waitFor(() => expect(mocked.getStatement).toHaveBeenCalledWith(Number(year), null));
    await waitFor(() => expect(getByText("Aucoumea klaineana")).toBeTruthy());

    fireEvent.press(getByTestId("quarter-1"));
    fireEvent.press(getByTestId("load-statement"));
    await waitFor(() => expect(mocked.getStatement).toHaveBeenCalledWith(Number(year), 1));

    fireEvent.press(getByTestId("export-statement"));
    await waitFor(() =>
      expect(mockedPdf.exportStatementPdf).toHaveBeenCalledWith(Number(year), 1),
    );
  });
});
