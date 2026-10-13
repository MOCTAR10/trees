import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

const mapProps: { current: any } = { current: null };

jest.mock("react-native-maps", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const MapView = ReactLib.forwardRef((props: any, ref: any) => {
    mapProps.current = props;
    ReactLib.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }));
    return ReactLib.createElement(View, { testID: props.testID }, props.children);
  });
  const leaf = (name: string) => (props: any) =>
    ReactLib.createElement(View, { testID: `${name}`, ...props });
  return {
    __esModule: true,
    default: MapView,
    Marker: leaf("marker"),
    Polygon: leaf("polygon"),
    UrlTile: leaf("url-tile"),
  };
});

jest.mock("../src/api/client", () => ({
  listMyTrees: jest.fn(async () => [
    {
      id: 1,
      species_scientific_name: "Aucoumea klaineana",
      measured_dbh_cm: 62.4,
      latitude: -0.2,
      longitude: 11.5,
      co2e_kg: 5400,
      eudr_verdict: "conforme",
      tree_code: "GA-DEMO-005",
    },
  ]),
  listGroupTrees: jest.fn(async () => []),
  getMapTiles: jest.fn(async () => [
    { key: "tree_cover_loss", label: "Perte de couvert", url: "https://t/{z}/{x}/{y}.png", source: "UMD" },
  ]),
  getMapLayers: jest.fn(async () => ({
    labels: { aac: "AAC", protected_areas: "Aires protégées (WDPA)" },
    layers: {
      aac: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[11, -1], [12, -1], [12, 0], [11, -1]]] },
            properties: { label: "DEMO-AAC-2026-01" },
          },
        ],
      },
      protected_areas: { type: "FeatureCollection", features: [] },
    },
  })),
  getNationalContext: jest.fn(async () => ({
    country: "Gabon",
    source: "GFW",
    highlights: [{ key: "primary_forest_2001", label: "Forêt primaire humide 2001", value: 22669515, unit: "ha" }],
    emissions_by_year: [],
    emissions_latest_year: 2025,
    emissions_by_driver: [
      { driver: "Logging", label: "Exploitation forestière", latest_co2e_mg: 1, latest_share: 0.117 },
    ],
    provinces: [],
  })),
  checkMapPoint: jest.fn(async () => ({
    verdict: "risque_deforestation",
    flags: ["perte_couvert_apres_2020"],
    loss_years: [2023],
    radd_alerts: 0,
    natural_forest_2020: true,
    protected_area: null,
    logging_concession: "Société Forestière Démo",
  })),
}));

import * as client from "../src/api/client";
import MapScreen from "../src/screens/MapScreen";

describe("MapScreen (Map 2.0)", () => {
  it("draws AAC polygons, toggles the GFW tile layer and colours scans by EUDR verdict", async () => {
    const { getByTestId, queryAllByTestId, getAllByTestId } = render(<MapScreen />);
    await waitFor(() => expect(getByTestId("layer-tree_cover_loss")).toBeTruthy());
    expect(getAllByTestId("polygon")).toHaveLength(1); // AAC on by default
    expect(queryAllByTestId("url-tile")).toHaveLength(0);
    fireEvent.press(getByTestId("layer-tree_cover_loss"));
    expect(getAllByTestId("url-tile")[0].props.urlTemplate).toContain("{z}/{x}/{y}");
    fireEvent.press(getByTestId("layer-aac"));
    expect(queryAllByTestId("polygon")).toHaveLength(0);
    const marker = getAllByTestId("marker")[0];
    expect(marker.props.pinColor).toBe("#2E9E5B");
    expect(marker.props.description).toContain("5.4 t CO₂e");
  });

  it("runs a GFW forest check on long press", async () => {
    const { getByTestId, getByText } = render(<MapScreen />);
    await waitFor(() => expect(mapProps.current).not.toBeNull());
    await act(async () => {
      await mapProps.current.onLongPress({ nativeEvent: { coordinate: { latitude: -0.3, longitude: 11.4 } } });
    });
    expect(client.checkMapPoint).toHaveBeenCalledWith(-0.3, 11.4);
    expect(getByTestId("forest-checks")).toBeTruthy();
    expect(getByText("Risque de déforestation")).toBeTruthy();
    expect(getByText("• Perte de couvert après le 31/12/2020 (seuil RDUE)")).toBeTruthy();
    fireEvent.press(getByTestId("point-close"));
  });

  it("explains when GFW is not configured", async () => {
    (client.checkMapPoint as jest.Mock).mockResolvedValueOnce(null);
    const { getByText } = render(<MapScreen />);
    await waitFor(() => expect(mapProps.current).not.toBeNull());
    await act(async () => {
      await mapProps.current.onLongPress({ nativeEvent: { coordinate: { latitude: 0, longitude: 10 } } });
    });
    expect(getByText(/pas encore configuré/)).toBeTruthy();
  });

  it("opens the national Gabon context", async () => {
    const { getByTestId, getByText } = render(<MapScreen />);
    fireEvent.press(getByTestId("context-button"));
    await waitFor(() => expect(getByText("Forêt primaire humide 2001")).toBeTruthy());
    expect(getByText("22,7 M ha")).toBeTruthy();
    expect(getByText("11.7 %")).toBeTruthy();
  });
});
