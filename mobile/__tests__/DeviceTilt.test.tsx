import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Platform, Text } from "react-native";

type Gravity = (data: { x: number; y: number; z: number }) => void;
type Motion = (data: { rotation: { alpha: number; beta: number; gamma: number } }) => void;
const sensors: { motionAvailable: boolean; gravity: Gravity | null; motion: Motion | null } = {
  motionAvailable: false,
  gravity: null,
  motion: null,
};

jest.mock("expo-sensors", () => ({
  DeviceMotion: {
    isAvailableAsync: jest.fn(async () => sensors.motionAvailable),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((cb: Motion) => {
      sensors.motion = cb;
      return { remove: jest.fn() };
    }),
  },
  Accelerometer: {
    isAvailableAsync: jest.fn(async () => true),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((cb: Gravity) => {
      sensors.gravity = cb;
      return { remove: jest.fn() };
    }),
  },
}));

import { useDeviceTilt } from "../src/utils/useDeviceTilt";

function Probe() {
  const tilt = useDeviceTilt(true);
  return <Text testID="tilt">{tilt.available ? `${tilt.elevationDeg.toFixed(0)} ${tilt.rollDeg.toFixed(0)}` : "none"}</Text>;
}

const rad = Math.PI / 180;

describe("useDeviceTilt", () => {
  const os = Platform.OS;
  beforeAll(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
  });
  afterAll(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
  });

  beforeEach(() => {
    sensors.gravity = null;
    sensors.motion = null;
    jest.useRealTimers();
  });

  it("reads the accelerometer when the phone has no fused rotation sensor (no gyroscope)", async () => {
    sensors.motionAvailable = false;
    const view = render(<Probe />);
    await waitFor(() => expect(sensors.gravity).not.toBeNull());
    act(() => sensors.gravity!({ x: 0, y: Math.cos(40 * rad), z: -Math.sin(40 * rad) }));
    expect(view.getByTestId("tilt").props.children).toBe("40 0");
  });

  it("keeps the fused rotation when the phone reports it", async () => {
    sensors.motionAvailable = true;
    const view = render(<Probe />);
    await waitFor(() => expect(sensors.motion).not.toBeNull());
    act(() => sensors.motion!({ rotation: { alpha: 0, beta: Math.PI / 2 + 20 * rad, gamma: 0 } }));
    expect(view.getByTestId("tilt").props.children).toBe("20 0");
    expect(sensors.gravity).toBeNull();
  });

  it("falls back to gravity when the fused sensor is announced but stays silent", async () => {
    jest.useFakeTimers();
    sensors.motionAvailable = true;
    const view = render(<Probe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sensors.motion).not.toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1600);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sensors.gravity).not.toBeNull();
    act(() => sensors.gravity!({ x: 0, y: Math.cos(15 * rad), z: Math.sin(15 * rad) }));
    expect(view.getByTestId("tilt").props.children).toBe("-15 0");
  });
});
