import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../src/api/client", () => ({
  listDeclarations: jest.fn(async () => [
    { id: 41, permit_type: "CFAD", permit_number: "07", status: "soumise", line_count: 2, aac_label: "AAC-01", decision_motif: null },
    { id: 40, permit_type: "CFAD", permit_number: "06", status: "autorisee", line_count: 5, aac_label: "AAC-01", decision_motif: null },
  ]),
  getDeclaration: jest.fn(async () => ({
    declaration: {},
    lines: [{ id: 1, tree_code: "GA-0001", species_scientific_name: "Aucoumea klaineana", measured_dbh_cm: 82, dme_cm: 70, violations: [] }],
  })),
  decideDeclaration: jest.fn(async () => ({ id: 41, status: "rejetee" })),
  assessFellingCompliance: jest.fn(async () => ({ declaration_id: 41, blockers: [], warnings: [], compliant: true })),
  listDocumentTypes: jest.fn(async () => []),
}));

import * as client from "../src/api/client";
import AdminDeclarations from "../src/components/AdminDeclarations";

const mocked = client as jest.Mocked<typeof client>;
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("AdminDeclarations", () => {
  it("lists files to decide first and requires a reason to reject", async () => {
    const view = render(<AdminDeclarations />);
    await flush();
    expect(view.getByText("À décider (1)")).toBeTruthy();
    expect(view.queryByTestId("declaration-40")).toBeNull();
    fireEvent.press(view.getByText("Déclaration n°41 · CFAD 07"));
    await flush();
    expect(view.getByText("GA-0001")).toBeTruthy();

    fireEvent.press(view.getByTestId("declaration-reject-41"));
    expect(view.getByText("Motif obligatoire pour rejeter.")).toBeTruthy();
    expect(mocked.decideDeclaration).not.toHaveBeenCalled();

    fireEvent.changeText(view.getByTestId("declaration-motif-41"), "Tiges hors AAC");
    fireEvent.press(view.getByTestId("declaration-reject-41"));
    await flush();
    expect(mocked.decideDeclaration).toHaveBeenCalledWith(41, "rejetee", "Tiges hors AAC");

    fireEvent.press(view.getByText("Tous (2)"));
    expect(view.getByTestId("declaration-40")).toBeTruthy();
  });
});
