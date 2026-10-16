import { render } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-sensors", () => ({
  DeviceMotion: {
    isAvailableAsync: jest.fn(async () => false),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import SensorHud from "../src/components/SensorHud";

const H = { includeHiddenElements: true };

describe("SensorHud", () => {
  it("mirrors the real sensor states", () => {
    const { getByText, queryByText } = render(
      <SensorHud gps="ok" position={{ lat: 0.3901, lon: 9.4544 }} depthSensor={false} aiSegmentation={true} />,
    );
    expect(getByText("0.3901  9.4544", H)).toBeTruthy();
    expect(getByText("PLAQUE QR", H)).toBeTruthy();
    expect(getByText("SEGMENTATION", H)).toBeTruthy();
    expect(getByText("LECTURE ACTIVE", H)).toBeTruthy();
    expect(queryByText("CAPTEUR ACTIF", H)).toBeNull();
  });

  it("says when the GPS is still searching and shows the depth sensor when present", () => {
    const { getByText, queryByText } = render(
      <SensorHud gps="waiting" position={null} depthSensor aiSegmentation={false} clearCentre />,
    );
    expect(getByText("RECHERCHE…", H)).toBeTruthy();
    expect(getByText("CAPTEUR ACTIF", H)).toBeTruthy();
    expect(queryByText("SEGMENTATION", H)).toBeNull();
  });
});
