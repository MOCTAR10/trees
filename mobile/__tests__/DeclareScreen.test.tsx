import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("../src/api/client", () => ({
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

    fireEvent.press(getByTestId("submit-declaration"));
    expect(getByText(/numéro de permis/)).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText("PFA-2026-07"), "PFA-2026-07");
    fireEvent.changeText(getByPlaceholderText(/GA-2026/), "GA-2026-0001");
    fireEvent.press(getByText(/Ajouter un pied/));

    const codeFields = getAllByPlaceholderText(/GA-2026/);
    expect(codeFields).toHaveLength(2);
    fireEvent.changeText(codeFields[1], "GA-2026-0002");

    fireEvent.press(getByTestId("submit-declaration"));

    await waitFor(() => expect(createDeclaration).toHaveBeenCalledTimes(1));
    const payload = (createDeclaration as jest.Mock).mock.calls[0][0];
    expect(payload.permit_type).toBe("PFA");
    expect(payload.permit_number).toBe("PFA-2026-07");
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
