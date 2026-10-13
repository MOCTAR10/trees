import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

const mockAnimate = jest.fn();

jest.mock("react-native-maps", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const MapView = ReactLib.forwardRef((props: any, ref: any) => {
    ReactLib.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimate }));
    return ReactLib.createElement(View, { testID: props.testID }, props.children);
  });
  const leaf = (name: string) => (props: any) =>
    ReactLib.createElement(View, { testID: props.testID ?? name, ...props }, props.children);
  return { __esModule: true, default: MapView, Marker: leaf("marker"), Polygon: leaf("polygon") };
});

jest.mock("../src/api/client", () => ({
  getChantier: jest.fn(),
  acceptProjectInvitation: jest.fn(async () => ({ id: 7, status: "active" })),
  declineProjectInvitation: jest.fn(async () => ({ id: 7, status: "declined" })),
  leaveProject: jest.fn(async () => ({ id: 7, joined: false })),
}));

import * as client from "../src/api/client";
import { ChantierView } from "../src/api/client";
import ChantierScreen from "../src/screens/ChantierScreen";

const mocked = client as jest.Mocked<typeof client>;

function chantier(overrides: Partial<ChantierView> = {}): ChantierView {
  return {
    id: 7,
    title: "Chantier Démo — inventaire AAC 2026-01",
    description: "Mesure des tiges inventoriées.",
    status: "open",
    kind: "chantier",
    participation: "invitation",
    aac_id: 25,
    created_by: 14,
    created_by_name: "Société Forestière Démo",
    created_at: "2026-10-01T00:00:00Z",
    my_status: "active",
    aac: {
      id: 25,
      label: "DEMO-AAC-2026-01",
      status: "ouvert",
      campaign_year: 2026,
      surface_ha: 1200,
      ufa_label: "UFA Démo 1",
      title_reference: "DEMO-CFAD-01",
      geometry: { type: "Polygon", coordinates: [[[11.4, -0.3], [11.6, -0.3], [11.6, -0.1], [11.4, -0.3]]] },
    },
    trees: [
      { id: 2, tree_code: "GA-002", species_scientific_name: "Aucoumea klaineana", status: "inventorie", measured_dbh_cm: null, latitude: -0.21, longitude: 11.51, measured: false, measured_by_me: false },
      { id: 3, tree_code: "GA-003", species_scientific_name: null, status: "inventorie", measured_dbh_cm: null, latitude: null, longitude: null, measured: false, measured_by_me: false },
      { id: 1, tree_code: "GA-001", species_scientific_name: "Baillonella toxisperma", status: "inventorie", measured_dbh_cm: 82, latitude: -0.2, longitude: 11.5, measured: true, measured_by_me: true },
    ],
    progress: { measured: 1, total: 3 },
    team: [
      { user_id: 15, status: "active", display_name: "Nzé Obiang", first_name: "Nzé", last_name: "Obiang", scans: 1 },
      { user_id: 16, status: "invited", display_name: "Ada Mba", first_name: null, last_name: null, scans: 0 },
    ],
    my_scans: [{ id: 90, species_scientific_name: "Baillonella toxisperma", measured_dbh_cm: 82, tree_code: "GA-001", created_at: "2026-10-13T09:00:00Z" }],
    ...overrides,
  };
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("ChantierScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the AAC, progress, map, trees to measure, team and my scans", async () => {
    mocked.getChantier.mockResolvedValue(chantier());
    const onScan = jest.fn();
    const view = render(<ChantierScreen id={7} onBack={jest.fn()} onScan={onScan} />);
    await flush();

    expect(view.getByTestId("chantier-aac")).toHaveTextContent("DEMO-AAC-2026-01 · UFA Démo 1 · DEMO-CFAD-01");
    expect(view.getByTestId("chantier-progress")).toHaveTextContent("1/3");
    expect(view.getByTestId("chantier-map")).toBeTruthy();
    expect(view.getByTestId("chantier-marker-1").props.pinColor).toBe("#2C64A6");
    expect(view.getByTestId("chantier-marker-2").props.pinColor).toBe("#D9B44A");
    expect(view.queryByTestId("chantier-marker-3")).toBeNull();

    expect(view.getByText("À mesurer (2)")).toBeTruthy();
    expect(view.getByTestId("chantier-tree-2")).toBeTruthy();
    expect(view.queryByTestId("chantier-tree-1")).toBeNull();
    fireEvent.press(view.getByTestId("chantier-tree-2"));
    expect(mockAnimate).toHaveBeenCalledWith(expect.objectContaining({ latitude: -0.21, longitude: 11.51 }), 400);
    fireEvent.press(view.getByText("Mesurées (1)"));
    expect(view.getByTestId("chantier-tree-1")).toHaveTextContent(/Par moi/);

    expect(view.getByTestId("chantier-member-15")).toHaveTextContent(/Nzé Obiang.*1 scan/);
    expect(view.getByTestId("chantier-member-16")).toHaveTextContent(/Ada Mba.*Invité/);
    expect(view.getByTestId("chantier-my-scans")).toHaveTextContent(/GA-001/);

    fireEvent.press(view.getByTestId("chantier-scan"));
    expect(onScan).toHaveBeenCalledWith({ id: 7, title: "Chantier Démo — inventaire AAC 2026-01", kind: "chantier" });
  });

  it("lets an invited agent accept from the chantier", async () => {
    mocked.getChantier
      .mockResolvedValueOnce(chantier({ my_status: "invited" }))
      .mockResolvedValueOnce(chantier({ my_status: "active" }));
    const view = render(<ChantierScreen id={7} onBack={jest.fn()} onScan={jest.fn()} />);
    await flush();
    expect(view.queryByTestId("chantier-scan")).toBeNull();
    fireEvent.press(view.getByTestId("chantier-accept"));
    await flush();
    expect(mocked.acceptProjectInvitation).toHaveBeenCalledWith(7);
    expect(view.getByTestId("chantier-scan")).toBeTruthy();
  });

  it("leaves the chantier and goes back", async () => {
    mocked.getChantier.mockResolvedValue(chantier());
    const onBack = jest.fn();
    const view = render(<ChantierScreen id={7} onBack={onBack} onScan={jest.fn()} />);
    await flush();
    fireEvent.press(view.getByTestId("chantier-leave"));
    await flush();
    expect(mocked.leaveProject).toHaveBeenCalledWith(7);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("offers a retry when the chantier cannot be loaded", async () => {
    mocked.getChantier.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(chantier());
    const view = render(<ChantierScreen id={7} onBack={jest.fn()} onScan={jest.fn()} />);
    await flush();
    expect(view.getByText("Chargement du chantier impossible.")).toBeTruthy();
    fireEvent.press(view.getByText("Réessayer"));
    await flush();
    expect(view.getByTestId("chantier-screen")).toBeTruthy();
  });
});
