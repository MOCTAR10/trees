import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -0.22, longitude: 11.5 } })),
}));

const tree = (over: Record<string, unknown> = {}) => ({
  tree_code: "GA-DEMO-004",
  status: "autorise",
  status_label: "Autorisé",
  species_scientific_name: "Aucoumea klaineana",
  measured_dbh_cm: 90,
  marking_type: "qr",
  hammer_mark: null,
  df10_entry_no: null,
  felled_at: null,
  aac_label: "DEMO-AAC-2026-01",
  custodian_name: "Société Forestière Démo",
  history: [],
  transport: null,
  is_holder: true,
  next_event: "abattu",
  can_receive: false,
  ...over,
});

jest.mock("../src/api/client", () => {
  const actual = jest.requireActual("../src/api/client");
  return {
    parseScannedCode: actual.parseScannedCode,
    getTreeCustody: jest.fn(),
    recordCustodyEvent: jest.fn(async () => ({ id: 1 })),
    listTransportDocuments: jest.fn(async () => []),
    actOnTransportDocument: jest.fn(async () => ({ id: 18, status: "receptionne" })),
    listRegistryTrees: jest.fn(async () => [
      { id: 1, tree_code: "GA-REG-01", marking_type: "qr", species_scientific_name: "Aucoumea klaineana", measured_dbh_cm: 90, status: "abattu", permit_number: null, aac_label: "AAC 1", latitude: null, longitude: null, created_at: "2026-10-01" },
    ]),
  };
});

import * as client from "../src/api/client";
import CustodyScreen from "../src/screens/CustodyScreen";

const mocked = client as jest.Mocked<typeof client>;
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("CustodyScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("parses plate and slip QR codes", () => {
    expect(client.parseScannedCode(" GA-1 ")).toEqual({ kind: "tree", code: "GA-1" });
    expect(client.parseScannedCode("bordereau_roulage|BDR-AB12|3|7.5")).toEqual({ kind: "slip", code: "BDR-AB12" });
  });

  it("records the felling of an authorised tree with GPS", async () => {
    mocked.getTreeCustody
      .mockResolvedValueOnce(tree() as never)
      .mockResolvedValueOnce(
        tree({
          status: "abattu",
          status_label: "Abattu",
          next_event: null,
          df10_entry_no: "DF10-2026-000004",
          history: [{ event: "abattu", created_at: "2026-10-14T10:00:00Z", note: null, transport_document_id: null, actor: "Nzé Obiang", latitude: -0.22, longitude: 11.5 }],
        }) as never,
      );
    const view = render(<CustodyScreen />);
    fireEvent.changeText(view.getByTestId("custody-code"), "GA-DEMO-004");
    fireEvent.press(view.getByTestId("custody-check"));
    await flush();
    expect(mocked.getTreeCustody).toHaveBeenCalledWith("GA-DEMO-004");
    expect(view.getByTestId("custody-record")).toHaveTextContent("Enregistrer l'abattage");
    fireEvent.press(view.getByTestId("custody-record"));
    await flush();
    expect(mocked.recordCustodyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tree_code: "GA-DEMO-004", event: "abattu", latitude: -0.22, longitude: 11.5 }),
    );
    expect(view.getByTestId("custody-info")).toHaveTextContent(/Position GPS jointe/);
    expect(view.getByTestId("custody-history-abattu")).toHaveTextContent(/Nzé Obiang/);
    expect(view.getByTestId("custody-no-action")).toHaveTextContent(/bordereau/);
  });

  it("lets the destination receive the slip carrying the log", async () => {
    mocked.getTreeCustody.mockResolvedValue(
      tree({
        status: "transporte",
        status_label: "En transport",
        is_holder: false,
        next_event: null,
        can_receive: true,
        transport: { id: 18, reference: "BDR-AUDIT", doc_type: "bordereau_roulage", status: "emis", destination_name: "Scierie Demo", to_label: null },
      }) as never,
    );
    const view = render(<CustodyScreen />);
    fireEvent.changeText(view.getByTestId("custody-code"), "GA-DEMO-004");
    fireEvent.press(view.getByTestId("custody-check"));
    await flush();
    expect(view.getByTestId("custody-transport")).toHaveTextContent(/BDR-AUDIT vers Scierie Demo/);
    fireEvent.press(view.getByTestId("custody-receive"));
    await flush();
    expect(mocked.actOnTransportDocument).toHaveBeenCalledWith(18, "receptionne");
  });

  it("shows server refusals and unknown codes", async () => {
    mocked.getTreeCustody.mockRejectedValueOnce(new Error("Tree 404"));
    const view = render(<CustodyScreen />);
    fireEvent.changeText(view.getByTestId("custody-code"), "NOPE");
    fireEvent.press(view.getByTestId("custody-check"));
    await flush();
    expect(view.getByTestId("custody-error")).toHaveTextContent("Code inconnu au registre.");

    mocked.getTreeCustody.mockResolvedValueOnce(tree() as never);
    mocked.recordCustodyEvent.mockRejectedValueOnce(new Error("Abattage refusé : art. 14"));
    fireEvent.changeText(view.getByTestId("custody-code"), "GA-DEMO-004");
    fireEvent.press(view.getByTestId("custody-check"));
    await flush();
    fireEvent.press(view.getByTestId("custody-record"));
    await flush();
    expect(view.getByTestId("custody-error")).toHaveTextContent("Abattage refusé : art. 14");
  });

  it("lists the organisation's logs and opens one on tap", async () => {
    mocked.getTreeCustody.mockResolvedValue(tree({ tree_code: "GA-REG-01", status: "abattu", next_event: null }) as never);
    const view = render(<CustodyScreen />);
    await flush();
    expect(view.getByTestId("custody-registry")).toBeTruthy();
    expect(view.getByText("Abattu")).toBeTruthy();
    fireEvent.press(view.getByTestId("custody-registry-GA-REG-01"));
    await flush();
    expect(mocked.getTreeCustody).toHaveBeenCalledWith("GA-REG-01");
    expect(view.queryByTestId("custody-registry")).toBeNull();
  });
});
