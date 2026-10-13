import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";
import * as pdf from "../src/pdf";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import TitleStudies from "../src/components/TitleStudies";

const mocked = client as jest.Mocked<typeof client>;
const mockedPdf = pdf as jest.Mocked<typeof pdf>;

const soumis = {
  id: 701,
  title_id: 30,
  study_type: "ppf" as const,
  reference: "PPF-2026-01",
  authority: "DGFAP",
  conducted_at: "2026-01-05",
  valid_from: "2026-01-05",
  valid_to: "2031-01-05",
  status: "soumis" as const,
  certificate_ref: null,
  certificate_issued_at: null,
  created_at: "now",
};

const valide = {
  ...soumis,
  id: 702,
  study_type: "eie" as const,
  reference: "EIE-2026-01",
  authority: "DGE",
  status: "valide" as const,
};

describe("TitleStudies", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists the studies for a company and exports the PDF", async () => {
    mocked.listStudies.mockResolvedValue([soumis, valide]);
    mockedPdf.exportStudyPdf.mockResolvedValue("etude_701.pdf");

    const { getByTestId, queryByTestId } = render(
      <TitleStudies titleId={30} mode="company" />,
    );
    await waitFor(() => expect(getByTestId("study-pdf-701")).toBeTruthy());
    // The company may declare a study but never decide or certify one.
    expect(getByTestId("study-add-ppf")).toBeTruthy();
    expect(queryByTestId("study-validate-701")).toBeNull();

    fireEvent.press(getByTestId("study-pdf-701"));
    await waitFor(() => expect(mockedPdf.exportStudyPdf).toHaveBeenCalledWith(30, 701));
  });

  it("shows an empty state when no study has been deposited", async () => {
    mocked.listStudies.mockResolvedValue([]);

    const { getByText } = render(<TitleStudies titleId={30} mode="company" />);
    await waitFor(() =>
      expect(getByText("Aucune étude environnementale déposée.")).toBeTruthy(),
    );
  });

  it("lets the company declare a PPF", async () => {
    mocked.listStudies.mockResolvedValue([]);
    mocked.createStudy.mockResolvedValue(soumis);

    const { getByTestId } = render(<TitleStudies titleId={30} mode="company" />);
    await waitFor(() => expect(getByTestId("study-add-ppf")).toBeTruthy());

    fireEvent.press(getByTestId("study-add-ppf"));
    fireEvent.changeText(getByTestId("study-reference"), "PPF-2026-01");
    fireEvent.press(getByTestId("study-submit"));

    await waitFor(() =>
      expect(mocked.createStudy).toHaveBeenCalledWith(
        30,
        expect.objectContaining({
          study_type: "ppf",
          reference: "PPF-2026-01",
        }),
      ),
    );
  });

  it("lets the Ministry validate a submitted study", async () => {
    mocked.listStudies.mockResolvedValue([soumis]);
    mocked.decideStudy.mockResolvedValue({ id: 701, title_id: 30, status: "valide" });

    const { getByTestId, queryByTestId } = render(<TitleStudies titleId={30} mode="admin" />);
    await waitFor(() => expect(getByTestId("study-validate-701")).toBeTruthy());
    // The Ministry does not deposit studies.
    expect(queryByTestId("study-add-ppf")).toBeNull();

    fireEvent.press(getByTestId("study-validate-701"));

    await waitFor(() => expect(mocked.decideStudy).toHaveBeenCalledWith(30, 701, "valide", null));
  });

  it("requires a motif before rejecting a study", async () => {
    mocked.listStudies.mockResolvedValue([soumis]);
    mocked.decideStudy.mockResolvedValue({ id: 701, title_id: 30, status: "rejete" });

    const { getByText, getByTestId } = render(<TitleStudies titleId={30} mode="admin" />);
    await waitFor(() => expect(getByTestId("study-reject-701")).toBeTruthy());

    fireEvent.press(getByTestId("study-reject-701"));
    fireEvent.press(getByTestId("study-reject-submit"));
    expect(mocked.decideStudy).not.toHaveBeenCalled();
    expect(getByText("Motif requis.")).toBeTruthy();

    fireEvent.changeText(getByTestId("study-reject-motif"), "Inventaire faunique incomplet");
    fireEvent.press(getByTestId("study-reject-submit"));

    await waitFor(() =>
      expect(mocked.decideStudy).toHaveBeenCalledWith(
        30,
        701,
        "rejete",
        "Inventaire faunique incomplet",
      ),
    );
  });

  it("lets the Ministry issue the certificat de conformité once validated", async () => {
    mocked.listStudies.mockResolvedValue([valide]);
    mocked.issueStudyCertificate.mockResolvedValue({
      id: 702,
      title_id: 30,
      certificate_ref: "CERT-CONF-01",
      certificate_issued_at: "2026-06-01",
    });

    const { getByTestId } = render(<TitleStudies titleId={30} mode="admin" />);
    await waitFor(() => expect(getByTestId("study-certify-702")).toBeTruthy());

    fireEvent.press(getByTestId("study-certify-702"));
    fireEvent.changeText(getByTestId("study-cert-ref"), "CERT-CONF-01");
    fireEvent.press(getByTestId("study-cert-submit"));

    await waitFor(() =>
      expect(mocked.issueStudyCertificate).toHaveBeenCalledWith(30, 702, "CERT-CONF-01"),
    );
  });
});
