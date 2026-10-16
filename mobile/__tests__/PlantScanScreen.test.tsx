import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-camera", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    CameraView: ReactLib.forwardRef((_props: any, ref: any) => {
      ReactLib.useImperativeHandle(ref, () => ({
        takePictureAsync: async () => ({ uri: "file:///leaf.jpg" }),
      }));
      return ReactLib.createElement(View, { testID: "camera-view" });
    }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock("expo-location", () => ({
  getLastKnownPositionAsync: jest.fn(async () => ({ coords: { latitude: 0.39, longitude: 9.45 } })),
}));

jest.mock("../src/api/client", () => ({
  identifyPlant: jest.fn(async () => ({
    scientific_name: "Aucoumea klaineana",
    score: 0.81,
    flora: "k-world-flora",
    candidates: [
      { scientific_name: "Aucoumea klaineana", common_name_fr: "Okoumé", score: 0.81, combined: 0.9 },
      { scientific_name: "Canarium schweinfurthii", score: 0.1, combined: 0.08 },
    ],
  })),
}));

import * as client from "../src/api/client";
import PlantScanScreen from "../src/screens/PlantScanScreen";

describe("PlantScanScreen", () => {
  it("takes photos by organ and shows the recognised species", async () => {
    const { getByTestId, getByText } = render(<PlantScanScreen onBack={jest.fn()} onTreeMode={jest.fn()} />);
    fireEvent.press(getByTestId("organ-flower"));
    await act(async () => {
      fireEvent.press(getByTestId("plant-shoot"));
    });
    await act(async () => {
      fireEvent.press(getByTestId("plant-identify"));
    });
    await waitFor(() => expect(getByTestId("plant-result")).toBeTruthy());
    expect(client.identifyPlant).toHaveBeenCalledWith({
      photos: [{ uri: "file:///leaf.jpg", organ: "flower" }],
      latitude: 0.39,
      longitude: 9.45,
    });
    expect(getByText("Aucoumea klaineana")).toBeTruthy();
    expect(getByText("Okoumé")).toBeTruthy();
    expect(getByText("90 %")).toBeTruthy();
    fireEvent.press(getByTestId("plant-again"));
    expect(getByTestId("plant-scan")).toBeTruthy();
  });

  it("switches back to the tree scan", () => {
    const onTreeMode = jest.fn();
    const { getByTestId } = render(<PlantScanScreen onBack={jest.fn()} onTreeMode={onTreeMode} />);
    fireEvent.press(getByTestId("mode-tree"));
    expect(onTreeMode).toHaveBeenCalled();
  });
});
