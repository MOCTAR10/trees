import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -0.5, longitude: 11.2 } })),
}));

const mockMapProps: { current: any } = { current: null };
const mockAnimate = jest.fn();

jest.mock("react-native-maps", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const MapView = ReactLib.forwardRef((props: any, ref: any) => {
    mockMapProps.current = props;
    ReactLib.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimate }));
    return ReactLib.createElement(View, { testID: props.testID }, props.children);
  });
  const leaf = (name: string) => (props: any) =>
    ReactLib.createElement(View, { testID: props.testID ?? name, ...props }, props.children);
  return {
    __esModule: true,
    default: MapView,
    Marker: leaf("marker"),
    Polygon: leaf("polygon"),
    UrlTile: leaf("url-tile"),
  };
});

const mockSquare = [[[11, -1], [12, -1], [12, 0], [11, -1]]];

jest.mock("../src/api/client", () => ({
  listMyTrees: jest.fn(async () => [
    { id: 1, latitude: -0.2, longitude: 11.5, eudr_verdict: "conforme", co2e_kg: 5400, measured_dbh_cm: 62 },
    { id: 2, latitude: -0.2001, longitude: 11.5001, eudr_verdict: "risque_deforestation" },
    { id: 3, latitude: 1.6, longitude: 13.2, eudr_verdict: null },
  ]),
  listGroupTrees: jest.fn(async () => []),
  getMapTiles: jest.fn(async () => [
    { key: "tree_cover_loss", label: "Perte de couvert", url: "https://t/{z}/{x}/{y}.png", source: "UMD" },
  ]),
  getMapLayers: jest.fn(async (params: { layers: string[] }) => ({
    labels: { aac: "AAC", protected_areas: "Aires protégées (WDPA)" },
    counts: { protected_areas: 61 },
    layers: Object.fromEntries(
      params.layers.map((k) => [
        k,
        {
          type: "FeatureCollection",
          features:
            k === "protected_areas"
              ? [{ type: "Feature", geometry: { type: "Polygon", coordinates: mockSquare }, properties: { id: 5, name: "Lopé" } }]
              : [],
        },
      ]),
    ),
  })),
  getMapFeature: jest.fn(async () => ({
    id: 5,
    layer: "protected_areas",
    name: "Parc national de la Lopé",
    area_ha: 491291,
    lat: -0.5,
    lon: 11.5,
    attrs: { desig: "Parc national", iucn_cat: "II" },
  })),
  searchMap: jest.fn(async () => [
    { kind: "gfw", layer: "protected_areas", id: 5, name: "Parc national de la Lopé", subtitle: "Parc national", lat: -0.5, lon: 11.5, west: 11, south: -1, east: 12, north: 0 },
  ]),
  getNationalContext: jest.fn(async () => ({
    country: "Gabon",
    source: "GFW",
    highlights: [{ key: "primary_forest_2001", label: "Forêt primaire humide 2001", value: 22669515, unit: "ha" }],
    emissions_by_year: [],
    emissions_latest_year: 2025,
    emissions_by_driver: [{ driver: "Logging", label: "Exploitation forestière", latest_co2e_mg: 1, latest_share: 0.117 }],
    provinces: [],
  })),
  checkMapPoint: jest.fn(async () => ({ verdict: "a_verifier", flags: ["aire_protegee"], protected_area: "Lopé" })),
  listProjects: jest.fn(async () => [
    {
      id: 7, title: "Chantier AAC 2026-1", kind: "chantier", status: "open", latitude: null, longitude: null,
      aac_lat: -0.6, aac_lon: 12.1, aac_label: "PILOTE-AAC 2026-1", registry_trees: 9, registry_scanned: 4,
      participant_count: 2, scan_count: 4,
    },
    {
      id: 8, title: "Cartographie du Moabi", kind: "participatif", status: "open", latitude: 0.4, longitude: 9.5,
      participant_count: 3, scan_count: 11,
    },
    { id: 9, title: "Sans position", kind: "participatif", status: "open", latitude: null, longitude: null, participant_count: 0, scan_count: 0 },
  ]),
}));

import * as client from "../src/api/client";
import MapScreen from "../src/screens/MapScreen";

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
};

describe("MapScreen (fluid map)", () => {
  it("fetches only the visible area, simplified for the zoom", async () => {
    render(<MapScreen />);
    await settle();
    const params = (client.getMapLayers as jest.Mock).mock.calls.at(-1)[0];
    expect(params.layers).toEqual(["aac", "protected_areas"]);
    expect(params.bbox).toHaveLength(4);
    expect(params.zoom).toBeGreaterThan(5);
    act(() =>
      mockMapProps.current.onRegionChangeComplete({ latitude: -0.2, longitude: 11.5, latitudeDelta: 0.1, longitudeDelta: 0.1 }),
    );
    await settle();
    expect((client.getMapLayers as jest.Mock).mock.calls.at(-1)[0].zoom).toBeGreaterThan(11);
  });

  it("clusters close scans and filters them by EUDR verdict", async () => {
    const { getAllByTestId, getByTestId, queryAllByTestId } = render(<MapScreen />);
    await settle();
    expect(getAllByTestId("cluster")).toHaveLength(1); // ids 1 + 2 merge at country zoom
    fireEvent.press(getByTestId("legend-button"));
    fireEvent.press(getByTestId("verdict-risque_deforestation"));
    expect(queryAllByTestId("cluster")).toHaveLength(0);
    expect(getByTestId("verdict-conforme").props.accessibilityState.checked).toBe(true);
  });

  it("opens a feature card on polygon tap and checks the point", async () => {
    const { getAllByTestId, getByTestId, getByText } = render(<MapScreen />);
    await settle();
    await act(async () => {
      getAllByTestId("polygon")[0].props.onPress();
    });
    expect(client.getMapFeature).toHaveBeenCalledWith("protected_areas", 5);
    expect(getByText("Parc national de la Lopé")).toBeTruthy();
    expect(getByText("Catégorie UICN")).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId("feature-check"));
    });
    expect(client.checkMapPoint).toHaveBeenCalledWith(-0.5, 11.5);
    expect(getByTestId("forest-checks")).toBeTruthy();
  });

  it("searches and flies to the result", async () => {
    const { getByTestId } = render(<MapScreen />);
    fireEvent.changeText(getByTestId("map-search"), "lop");
    await settle();
    expect(client.searchMap).toHaveBeenCalledWith("lop");
    await act(async () => {
      fireEvent.press(getByTestId("search-result-0"));
    });
    expect(mockAnimate).toHaveBeenCalled();
    expect(mockAnimate.mock.calls.at(-1)[0].longitudeDelta).toBeCloseTo(1.3);
  });

  it("switches base map and GFW layer from the legend", async () => {
    const { getByTestId, getAllByTestId } = render(<MapScreen />);
    await settle();
    fireEvent.press(getByTestId("legend-button"));
    fireEvent.press(getByTestId("base-satellite"));
    expect(mockMapProps.current.mapType).toBe("satellite");
    fireEvent.press(getByTestId("layer-tree_cover_loss"));
    expect(getAllByTestId("url-tile")[0].props.urlTemplate).toContain("{z}/{x}/{y}");
  });

  it("pins chantiers and open projects, opens their sheet and hides them from the legend", async () => {
    const onOpenProject = jest.fn();
    const { getByTestId, queryByTestId, getByText } = render(<MapScreen onOpenProject={onOpenProject} />);
    await settle();
    expect(getByTestId("project-pin-7")).toBeTruthy();
    expect(getByTestId("project-pin-8")).toBeTruthy();
    expect(queryByTestId("project-pin-9")).toBeNull();
    await act(async () => {
      getByTestId("project-pin-7").props.onPress();
    });
    expect(getByTestId("project-sheet")).toBeTruthy();
    expect(getByText("4/9 tiges du registre mesurées")).toBeTruthy();
    fireEvent.press(getByTestId("project-open"));
    expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    fireEvent.press(getByTestId("legend-button"));
    fireEvent.press(getByTestId("layer-projects"));
    expect(queryByTestId("project-pin-8")).toBeNull();
  });

  it("long press runs a forest check; context panel shows national figures", async () => {
    const { getByTestId, getByText } = render(<MapScreen />);
    await settle();
    await act(async () => {
      mockMapProps.current.onLongPress({ nativeEvent: { coordinate: { latitude: 0, longitude: 10 } } });
    });
    expect(client.checkMapPoint).toHaveBeenCalledWith(0, 10);
    fireEvent.press(getByTestId("context-button"));
    await waitFor(() => expect(getByText("Forêt primaire humide 2001")).toBeTruthy());
    expect(getByText("22,7 M ha")).toBeTruthy();
  });
});
