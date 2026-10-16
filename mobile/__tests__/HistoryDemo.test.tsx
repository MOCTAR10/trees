import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("../src/api/client", () => ({
  ...jest.requireActual("../src/api/client"),
  listGroupTrees: jest.fn(async () => []),
  getTreeCustody: jest.fn(async () => ({
    tree_code: "GA-PILOTE-0004",
    status: "transporte",
    status_label: "En transport",
    df10_entry_no: "DF10-2026-000004",
    aac_label: "PILOTE-AAC 2026-1",
    custodian_name: "Bois du Haut-Ogooué",
    felled_at: "2026-10-15T15:59:24Z",
    transport: { id: 2, reference: "PILOTE-BDR-002", destination_name: "Scierie de Lambaréné" },
    history: [{ event: "abattu", created_at: "2026-10-15T15:59:24Z", actor: "Prisca Mba" }],
  })),
}));

import HistoryScreen from "../src/screens/HistoryScreen";
import ReportScreen from "../src/screens/ReportScreen";
import { DEMO_SCANS } from "../src/data/demoScans";

describe("Mes scans demo data", () => {
  it("shows labelled example scans when nothing is stored, and opens one", () => {
    const onOpen = jest.fn();
    const { getByTestId, getByText, queryByLabelText } = render(
      <HistoryScreen scans={[]} onOpen={onOpen} onDelete={jest.fn()} onClear={jest.fn()} />,
    );
    expect(getByTestId("history-demo")).toBeTruthy();
    expect(getByText("Iroko")).toBeTruthy();
    expect(queryByLabelText("Supprimer")).toBeNull();
    fireEvent.press(getByText("Iroko"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "demo_1" }));
  });

  it("shows the DF10 and custody trail of a scanned log in the report", async () => {
    const { findByTestId, getByText } = render(
      <ReportScreen report={DEMO_SCANS[0].report} onValorize={null} />,
    );
    await findByTestId("tree-trail");
    await waitFor(() => expect(getByText("DF10-2026-000004")).toBeTruthy());
    expect(getByText("PILOTE-BDR-002 → Scierie de Lambaréné")).toBeTruthy();
  });
});
