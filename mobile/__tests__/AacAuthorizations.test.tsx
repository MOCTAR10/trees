import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import * as client from "../src/api/client";

jest.mock("../src/api/client");
jest.mock("../src/pdf");

import AacAuthorizations from "../src/components/AacAuthorizations";

const mocked = client as jest.Mocked<typeof client>;

const submitted = {
  id: 701,
  aac_id: 40,
  authorization_type: "certificat_assiette" as const,
  reference: "CA-1",
  valid_from: null,
  valid_to: null,
  startup_notified_at: null,
  plan_document_id: null,
  status: "soumis" as const,
  created_at: "now",
};

const delivered = {
  ...submitted,
  id: 702,
  status: "delivre" as const,
};

describe("AacAuthorizations", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lets a company request an authorization", async () => {
    mocked.listAuthorizations.mockResolvedValue([]);
    mocked.requestAuthorization.mockResolvedValue(submitted);

    const { getByText, getByTestId } = render(<AacAuthorizations aacId={40} mode="company" />);
    await waitFor(() => expect(getByText("Aucune autorisation.")).toBeTruthy());

    fireEvent.press(getByTestId("auth-request-40"));
    fireEvent.press(getByTestId("auth-type-cae"));
    fireEvent.press(getByTestId("auth-request-submit"));

    await waitFor(() =>
      expect(mocked.requestAuthorization).toHaveBeenCalledWith(
        40,
        expect.objectContaining({ authorization_type: "cae" }),
      ),
    );
  });

  it("lets the Ministry deliver a submitted authorization", async () => {
    mocked.listAuthorizations.mockResolvedValue([submitted]);
    mocked.decideAuthorization.mockResolvedValue({ id: 701, aac_id: 40, status: "delivre" });

    const { getByText, getByTestId } = render(<AacAuthorizations aacId={40} mode="admin" />);
    await waitFor(() => expect(getByText("Certificat d'assiette")).toBeTruthy());

    fireEvent.press(getByTestId("auth-deliver-701"));
    await waitFor(() =>
      expect(mocked.decideAuthorization).toHaveBeenCalledWith(701, "delivre"),
    );
  });

  it("requires a motif before rejecting", async () => {
    mocked.listAuthorizations.mockResolvedValue([submitted]);
    mocked.decideAuthorization.mockResolvedValue({ id: 701, aac_id: 40, status: "rejete" });

    const { getByText, getByTestId, getByPlaceholderText } = render(
      <AacAuthorizations aacId={40} mode="admin" />,
    );
    await waitFor(() => expect(getByText("Certificat d'assiette")).toBeTruthy());

    fireEvent.press(getByTestId("auth-reject-701"));
    fireEvent.press(getByTestId("auth-motif-submit"));
    expect(mocked.decideAuthorization).not.toHaveBeenCalled();
    expect(getByText("Motif requis pour un rejet.")).toBeTruthy();

    fireEvent.changeText(
      getByPlaceholderText("Motif (requis pour un rejet)"),
      "Pièces incomplètes",
    );
    fireEvent.press(getByTestId("auth-motif-submit"));

    await waitFor(() =>
      expect(mocked.decideAuthorization).toHaveBeenCalledWith(701, "rejete", "Pièces incomplètes"),
    );
  });

  it("lets a company notify the start of activities once delivered", async () => {
    mocked.listAuthorizations.mockResolvedValue([delivered]);
    mocked.notifyStartup.mockResolvedValue({ id: 702, aac_id: 40, status: "delivre" });

    const { getByText, getByTestId } = render(<AacAuthorizations aacId={40} mode="company" />);
    await waitFor(() => expect(getByText("Délivré")).toBeTruthy());

    fireEvent.press(getByTestId("auth-notify-702"));
    await waitFor(() => expect(mocked.notifyStartup).toHaveBeenCalledWith(702));
  });
});
