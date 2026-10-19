import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -0.71234, longitude: 13.61234 } })),
  Accuracy: { High: 4 },
}));

jest.mock("../src/api/client", () => ({
  parseScannedCode: (raw: string) => ({ kind: "tree", code: raw.trim() }),
  listFellingAacOptions: jest.fn(async () => [
    { id: 29, label: "DEMO-AAC-2026-01", status: "ouvert", campaign_year: 2026, ufa_label: "UFA Démo 1", title_id: 3, title_type: "CFAD", title_reference: "DEMO-CFAD-01", blocker: null },
    { id: 30, label: "DEMO-AAC-2026-02", status: "ferme", campaign_year: 2026, ufa_label: "UFA Démo 1", title_id: 3, title_type: "CFAD", title_reference: "DEMO-CFAD-01", blocker: "no_authorization" },
    { id: 31, label: "FC-AAC-2026", status: "ouvert", campaign_year: 2026, ufa_label: "FC Oyem", title_id: 9, title_type: "FC", title_reference: "FC-OI-03", blocker: null },
  ]),
  listRegistryTrees: jest.fn(async () => [
    { id: 1, tree_code: "GA-INV-01", marking_type: "qr", species_scientific_name: "Aucoumea klaineana", measured_dbh_cm: 82, status: "inventorie", permit_number: null, aac_label: "DEMO-AAC-2026-01", aac_id: 29, latitude: -0.7, longitude: 13.6, created_at: "2026-10-01" },
    { id: 2, tree_code: "GA-INV-02", marking_type: "qr", species_scientific_name: null, measured_dbh_cm: null, status: "inventorie", permit_number: null, aac_label: "DEMO-AAC-2026-02", aac_id: 30, latitude: null, longitude: null, created_at: "2026-10-01" },
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
    fireEvent.changeText(getByPlaceholderText(/GA-2026/), "GA-2026-0001");
    fireEvent.press(getByText(/Ajouter un pied/));

    const codeFields = getAllByPlaceholderText(/GA-2026/);
    expect(codeFields).toHaveLength(2);
    fireEvent.changeText(codeFields[1], "GA-2026-0002");

    fireEvent.press(getByTestId("submit-declaration"));

    await waitFor(() => expect(createDeclaration).toHaveBeenCalledTimes(1));
    const payload = (createDeclaration as jest.Mock).mock.calls[0][0];
    expect(payload.permit_type).toBeUndefined();
    expect(payload.permit_number).toBeUndefined();
    expect(payload).toMatchObject({ aac_id: 29, title_id: 3, aac_label: "DEMO-AAC-2026-01" });
    expect(payload.lines.map((l: { tree_code: string }) => l.tree_code)).toEqual([
      "GA-2026-0001",
      "GA-2026-0002",
    ]);

    await waitFor(() => expect(getByText(/Déclaration n°7/)).toBeTruthy());
    expect(getByText("Sous DME")).toBeTruthy();
    // Clean-line badge + dismiss button share the "OK" label.
    expect(getAllByText("OK").length).toBeGreaterThanOrEqual(2);

    fireEvent.press(getAllByText("OK").slice(-1)[0]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("takes the inventoried stems of the chosen AAC", async () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <DeclareScreen onDone={jest.fn()} onBack={jest.fn()} />,
    );
    await waitFor(() => expect(getByTestId("aac-option-29")).toBeTruthy());
    fireEvent.press(getByTestId("aac-option-29"));
    expect(getByText("Reprendre l'inventaire (1 tige)")).toBeTruthy();
    fireEvent.press(getByTestId("declare-from-inventory"));
    expect(queryByTestId("declare-from-inventory")).toBeNull();
    expect(getByTestId("tree-code-0").props.value).toBe("GA-INV-01");
    (createDeclaration as jest.Mock).mockClear();
    fireEvent.press(getByTestId("submit-declaration"));
    await waitFor(() => expect(createDeclaration).toHaveBeenCalledTimes(1));
    const line = (createDeclaration as jest.Mock).mock.calls[0][0].lines[0];
    expect(line).toMatchObject({ tree_code: "GA-INV-01", marking_type: "qr", measured_dbh_cm: 82 });
  });

  it("shows the title of the chosen AAC and adapts each stem to its marking", async () => {
    const { getByTestId, getByText, queryByTestId, getByPlaceholderText } = render(
      <DeclareScreen onDone={jest.fn()} onBack={jest.fn()} />,
    );
    await waitFor(() => expect(getByTestId("aac-option-31")).toBeTruthy());
    expect(queryByTestId("declare-title")).toBeNull();
    fireEvent.press(getByTestId("aac-option-31"));
    expect(getByText("Forêt communautaire")).toBeTruthy();
    expect(getByText("FC-OI-03")).toBeTruthy();
    expect(getByTestId("declare-title-note").props.children).toMatch(/communauté/);
    fireEvent.press(getByTestId("aac-option-29"));
    expect(getByText(/CFAD — Concession/)).toBeTruthy();

    expect(getByText("Code de la plaque QR")).toBeTruthy();
    fireEvent.press(getByText("N° peint"));
    expect(getByText("Numéro peint")).toBeTruthy();
    expect(getByPlaceholderText(/N° peint, ex/)).toBeTruthy();
    fireEvent.press(getByText("GPS + photo"));
    expect(getByText("Position attendue pour ce marquage.")).toBeTruthy();

    fireEvent.press(getByTestId("locate-0"));
    await waitFor(() => expect(getByText("Position : -0,71234, 13,61234")).toBeTruthy());
  });
});
