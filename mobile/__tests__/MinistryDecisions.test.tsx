import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -0.5, longitude: 11.2 } })),
}));

jest.mock("../src/api/client", () => ({
  getInboxDetail: jest.fn(async () => ({
    id: 41,
    type: "declarations",
    label: "Déclaration n° 41 · AAC 2026",
    org_name: "SFD",
    province_name: "Ogooué-Ivindo",
    authority: "Direction Provinciale",
    created_at: "2026-10-04T08:00:00Z",
    facts: [{ label: "Tiges", value: "12" }],
    checks: [
      { level: "ok", label: "Autorisation d'exploiter accordée" },
      { level: "ko", label: "2 tiges sous le DME" },
      { level: "warn", label: "Espèce CITES" },
    ],
    items: [{ label: "GA-DEMO-004", detail: "Okoumé · 52 cm", flags: ["below_dme"] }],
    approve_label: "Approuver",
    blocking: true,
  })),
  decideInbox: jest.fn(async () => ({ id: 41, status: "rejetee" })),
  listFieldControls: jest.fn(async () => [
    {
      id: 1,
      control_type: "route",
      result: "non_conforme",
      tree_code: "GA-DEMO-009",
      transport_document_id: null,
      aac_id: 29,
      aac_label: "AAC 2026",
      org_id: 10,
      org_name: "SFD",
      notes: "Grume sans bordereau",
      pv_reference: "PV-DEMO-002",
      controlled_by_name: "Admin",
      controlled_at: "2026-10-13T08:00:00Z",
    },
    {
      id: 2,
      control_type: "marquage",
      result: "conforme",
      tree_code: "GA-DEMO-001",
      transport_document_id: null,
      aac_id: 29,
      aac_label: "AAC 2026",
      org_id: 10,
      org_name: "SFD",
      notes: null,
      pv_reference: "PV-DEMO-001",
      controlled_by_name: "Admin",
      controlled_at: "2026-10-12T08:00:00Z",
    },
  ]),
  lookupControlCode: jest.fn(async (code: string) => ({
    kind: "tree",
    code,
    tree: {
      tree_code: code,
      status: "transporte",
      species_scientific_name: "Aucoumea klaineana",
      hammer_mark: null,
      df10_entry_no: null,
      aac_id: 29,
      aac_label: "AAC 2026",
      org_id: 10,
      org_name: "SFD",
    },
    transport: null,
    checks: [{ level: "ko", label: "En transport sans bordereau / feuille de route" }],
  })),
  createFieldControl: jest.fn(async () => ({ id: 3 })),
}));

import * as client from "../src/api/client";
import ControlsScreen from "../src/screens/ministry/ControlsScreen";
import DecisionScreen from "../src/screens/ministry/DecisionScreen";

const mocked = client as jest.Mocked<typeof client>;
const NOW = new Date("2026-10-14T10:00:00Z");
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("Ministry decisions and field controls", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the file, its checks and requires a reason to reject", async () => {
    const onDecided = jest.fn();
    const view = render(<DecisionScreen type="declarations" id={41} onBack={jest.fn()} onDecided={onDecided} now={NOW} />);
    await flush();
    expect(mocked.getInboxDetail).toHaveBeenCalledWith("declarations", 41);
    expect(view.getByText("Déclaration n° 41 · AAC 2026")).toBeTruthy();
    expect(view.getByText("Ogooué-Ivindo")).toBeTruthy();
    expect(view.getAllByTestId("check-ko")).toHaveLength(1);
    expect(view.getByText("GA-DEMO-004")).toBeTruthy();
    expect(view.getByTestId("decision-blocking")).toBeTruthy();

    fireEvent.press(view.getByTestId("decision-reject"));
    await flush();
    expect(mocked.decideInbox).not.toHaveBeenCalled();

    fireEvent.changeText(view.getByTestId("decision-motif"), "Tiges sous le DME");
    fireEvent.press(view.getByTestId("decision-reject"));
    await flush();
    expect(mocked.decideInbox).toHaveBeenCalledWith("declarations", 41, false, "Tiges sous le DME");
    expect(onDecided).toHaveBeenCalled();
  });

  it("approves with the domain label and surfaces server refusals", async () => {
    mocked.decideInbox.mockRejectedValueOnce(new Error("Autorisation manquante"));
    const onDecided = jest.fn();
    const view = render(<DecisionScreen type="declarations" id={41} onBack={jest.fn()} onDecided={onDecided} now={NOW} />);
    await flush();
    expect(view.getByTestId("decision-approve")).toHaveTextContent("Approuver");
    fireEvent.press(view.getByTestId("decision-approve"));
    await flush();
    expect(mocked.decideInbox).toHaveBeenCalledWith("declarations", 41, true, null);
    expect(view.getByTestId("decision-error")).toHaveTextContent("Autorisation manquante");
    expect(onDecided).not.toHaveBeenCalled();
  });

  it("lists field controls and filters them by result", async () => {
    const view = render(<ControlsScreen />);
    await flush();
    expect(view.getByTestId("control-1")).toHaveTextContent(/GA-DEMO-009/);
    expect(view.getByTestId("control-2")).toBeTruthy();
    fireEvent.press(view.getByTestId("control-result-non_conforme"));
    expect(view.queryByTestId("control-2")).toBeNull();
    expect(view.getByTestId("control-1")).toBeTruthy();
  });

  it("records a control from a looked-up code with findings and GPS", async () => {
    const view = render(<ControlsScreen />);
    await flush();
    fireEvent.press(view.getByTestId("control-new"));
    await flush();
    fireEvent.press(view.getByTestId("control-submit"));
    expect(mocked.createFieldControl).not.toHaveBeenCalled();
    expect(view.getByTestId("control-error")).toBeTruthy();

    fireEvent.changeText(view.getByTestId("control-code"), "GA-DEMO-009");
    fireEvent.press(view.getByTestId("control-check"));
    await flush();
    expect(mocked.lookupControlCode).toHaveBeenCalledWith("GA-DEMO-009");
    expect(view.getByTestId("control-lookup")).toHaveTextContent(/sans bordereau/);

    fireEvent.press(view.getByTestId("control-submit"));
    expect(mocked.createFieldControl).not.toHaveBeenCalled();

    fireEvent.changeText(view.getByTestId("control-notes"), "Grume sans bordereau");
    fireEvent.changeText(view.getByTestId("control-pv"), "PV-12");
    fireEvent.press(view.getByTestId("control-submit"));
    await flush();
    expect(mocked.createFieldControl).toHaveBeenCalledWith(
      expect.objectContaining({
        control_type: "route",
        result: "non_conforme",
        tree_code: "GA-DEMO-009",
        aac_id: 29,
        org_id: 10,
        notes: "Grume sans bordereau",
        pv_reference: "PV-12",
        latitude: -0.5,
        longitude: 11.2,
      }),
    );
    expect(mocked.listFieldControls).toHaveBeenCalledTimes(2);
  });
});
