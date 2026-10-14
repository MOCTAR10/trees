import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("../src/api/client", () => ({
  listFellingAacOptions: jest.fn(async () => [
    { id: 29, label: "DEMO-AAC-2026-01", status: "ouvert", campaign_year: 2026, ufa_label: "UFA Démo 1", title_id: 3, title_type: "CFAD", title_reference: "DEMO-CFAD-01", blocker: null },
    { id: 30, label: "DEMO-AAC-2026-02", status: "ferme", campaign_year: 2026, ufa_label: "UFA Démo 1", title_id: 3, title_type: "CFAD", title_reference: "DEMO-CFAD-01", blocker: "no_authorization" },
  ]),
  createDeclaration: jest.fn(async () => ({
    id: 7,
    status: "soumise",
    lines_checked: [
      { tree_code: "GA-2026-0001", dme_cm: 70, violations: ["below_dme"] },
      { tree_code: "GA-2026-0002", dme_cm: 80, violations: [] },
    ],
  })),
}));

import { createDeclaration } from "../src/api/client";
import DeclareScreen from "../src/screens/DeclareScreen";

describe("DeclareScreen", () => {
  it("validates, submits lines and shows per-line checks", async () => {
    const onDone = jest.fn();
    const { getByPlaceholderText, getAllByPlaceholderText, getAllByText, getByTestId, getByText } =
      render(<DeclareScreen onDone={onDone} onBack={jest.fn()} />);

    await waitFor(() => expect(getByTestId("aac-option-29")).toBeTruthy());
    fireEvent.press(getByTestId("submit-declaration"));
    expect(getByText("Choisissez l'AAC de la déclaration.")).toBeTruthy();

    expect(getByText("Aucune autorisation délivrée (art. 14)")).toBeTruthy();
    fireEvent.press(getByTestId("aac-option-30"));
    fireEvent.press(getByTestId("submit-declaration"));
    expect(getAllByText("Aucune autorisation délivrée (art. 14)").length).toBeGreaterThan(1);

    fireEvent.press(getByTestId("aac-option-29"));
    fireEvent.changeText(getByPlaceholderText("PFA-2026-07"), "PFA-2026-07");
    fireEvent.changeText(getByPlaceholderText(/GA-2026/), "GA-2026-0001");
    fireEvent.press(getByText(/Ajouter un pied/));

    const codeFields = getAllByPlaceholderText(/GA-2026/);
    expect(codeFields).toHaveLength(2);
    fireEvent.changeText(codeFields[1], "GA-2026-0002");

    fireEvent.press(getByTestId("submit-declaration"));

    await waitFor(() => expect(createDeclaration).toHaveBeenCalledTimes(1));
    const payload = (createDeclaration as jest.Mock).mock.calls[0][0];
    expect(payload.permit_type).toBe("CFAD");
    expect(payload.permit_number).toBe("PFA-2026-07");
    expect(payload).toMatchObject({ aac_id: 29, title_id: 3, aac_label: "DEMO-AAC-2026-01" });
    expect(payload.lines.map((l: { tree_code: string }) => l.tree_code)).toEqual([
      "GA-2026-0001",
      "GA-2026-0002",
    ]);

    await waitFor(() => expect(getByText(/Déclaration n°7/)).toBeTruthy());
    expect(getByText("Sous DME")).toBeTruthy();
    // Clean-line badge + dismiss button share the "OK" label.
    expect(getAllByText("OK")).toHaveLength(2);

    fireEvent.press(getAllByText("OK")[1]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
