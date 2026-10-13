import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";

jest.mock("expo-camera", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    CameraView: ReactLib.forwardRef((props: any, ref: any) => {
      const [ready, setReady] = ReactLib.useState(false);
      ReactLib.useImperativeHandle(ref, () => ({
        takePictureAsync: async () => ({
          uri: "file:///photo.jpg",
          exif: { FocalLenIn35mmFilm: 26 },
        }),
      }));
      ReactLib.useEffect(() => {
        setReady(true);
        props.onCameraReady?.();
      }, []);
      return ReactLib.createElement(View, { testID: "camera-view", ready });
    }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 0.4162, longitude: 9.4541 },
  })),
}));

jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: "file:///lib.jpg", fileName: "lib.jpg", mimeType: "image/jpeg" }],
  })),
}));

jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: jest.fn(async () => ({ exists: true, uri: "file:///lib.jpg", size: 100 })),
}));

import CaptureScreen from "../src/screens/CaptureScreen";

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  jest.clearAllMocks();
});

describe("CaptureScreen", () => {
  it("captures the required quick views and emits shots", async () => {
    const onCaptured = jest.fn();
    const { getByTestId, getByText, queryByTestId } = render(
      <CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />,
    );

    await waitFor(() => expect(getByText(/Position capturée/)).toBeTruthy());
    expect(queryByTestId("analyze-button")).toBeTruthy();

    fireEvent.press(getByTestId("mode-quick"));
    await flush();

    for (let i = 0; i < 3; i += 1) {
      fireEvent.press(getByTestId("capture-button"));
      await flush();
      if (i < 2) {
        fireEvent.press(getByTestId("next-button"));
        await flush();
      }
    }

    // Photo mode needs the bark distance before the analysis can start.
    fireEvent.press(getByTestId("analyze-button"));
    await flush();
    expect(onCaptured).not.toHaveBeenCalled();
    expect(getByText("Distance tronc-téléphone requise")).toBeTruthy();

    fireEvent.changeText(getByTestId("depth-input"), "2,1");
    fireEvent.press(getByTestId("analyze-button"));
    await flush();

    expect(onCaptured).toHaveBeenCalledTimes(1);
    const result = onCaptured.mock.calls[0][0];
    expect(result.latitude).toBeCloseTo(0.4162);
    expect(result.arDepthM).toBeCloseTo(2.1);
    expect(result.circumferenceCm).toBeUndefined();
    expect(result.shots.map((s: { organ: string }) => s.organ)).toEqual([
      "bark",
      "leaf",
      "whole",
    ]);
    expect(result.shots[0].focal35mm).toBe(26);
  });

  it("submits a tape circumference and a measured height without a distance", async () => {
    const onCaptured = jest.fn();
    const { getByTestId, getByText } = render(
      <CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />,
    );
    await waitFor(() => expect(getByText(/Position capturée/)).toBeTruthy());
    fireEvent.press(getByTestId("mode-quick"));
    await flush();
    for (let i = 0; i < 3; i += 1) {
      fireEvent.press(getByTestId("capture-button"));
      await flush();
      if (i < 2) {
        fireEvent.press(getByTestId("next-button"));
        await flush();
      }
    }

    fireEvent.press(getByTestId("measure-tape"));
    fireEvent.press(getByTestId("analyze-button"));
    await flush();
    expect(onCaptured).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId("reference-input"), "196");
    fireEvent.changeText(getByTestId("height-input"), "31.5");
    fireEvent.press(getByTestId("analyze-button"));
    await flush();

    const result = onCaptured.mock.calls[0][0];
    expect(result.circumferenceCm).toBe(196);
    expect(result.caliperDbhCm).toBeUndefined();
    expect(result.arDepthM).toBeUndefined();
    expect(result.measuredHeightM).toBeCloseTo(31.5);
    expect(result.heightSource).toBe("manual");
  });

  it("shows the breast-height guide on the DBH step", async () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />,
    );
    await waitFor(() => expect(getByText(/Position capturée/)).toBeTruthy());
    fireEvent.press(getByTestId("mode-quick"));
    await flush();
    expect(queryByTestId("dbh-guide")).toBeNull();
    for (let i = 0; i < 3; i += 1) {
      fireEvent.press(getByTestId("capture-button"));
      await flush();
      fireEvent.press(getByTestId("next-button"));
      await flush();
    }
    expect(getByTestId("dbh-guide")).toBeTruthy();
  });

  it("keeps the torch off by default and toggles on press", async () => {
    const { getByTestId } = render(
      <CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />,
    );
    await flush();
    const toggle = getByTestId("torch-toggle");
    expect(toggle.props.accessibilityState.checked).toBe(false);
    fireEvent.press(toggle);
    expect(getByTestId("torch-toggle").props.accessibilityState.checked).toBe(true);
  });

  it("goes back immediately when no shots were taken", async () => {
    const onBack = jest.fn();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const { getByTestId } = render(<CaptureScreen onCaptured={jest.fn()} onBack={onBack} />);
    await flush();
    fireEvent.press(getByTestId("back-button"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("asks for confirmation before discarding shots", async () => {
    const onBack = jest.fn();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const { getByTestId } = render(<CaptureScreen onCaptured={jest.fn()} onBack={onBack} />);
    await flush();
    fireEvent.press(getByTestId("capture-button"));
    await flush();
    fireEvent.press(getByTestId("back-button"));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>;
    const destructive = buttons.find((b) => b.onPress);
    destructive?.onPress?.();
    expect(onBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("imports gallery photos into the current step and submits them", async () => {
    const onCaptured = jest.fn();
    const { getByTestId, getByText } = render(
      <CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />,
    );
    await waitFor(() => expect(getByText(/Position capturée/)).toBeTruthy());
    fireEvent.press(getByTestId("mode-quick"));
    await flush();

    for (let i = 0; i < 3; i += 1) {
      fireEvent.press(getByTestId("import-button"));
      await flush();
      if (i < 2) {
        fireEvent.press(getByTestId("next-button"));
        await flush();
      }
    }

    expect(getByText("Importée")).toBeTruthy();
    fireEvent.changeText(getByTestId("depth-input"), "2");
    fireEvent.press(getByTestId("analyze-button"));
    await flush();

    expect(onCaptured).toHaveBeenCalledTimes(1);
    const result = onCaptured.mock.calls[0][0];
    expect(result.shots).toHaveLength(3);
    expect(result.shots.map((s: { organ: string }) => s.organ)).toEqual([
      "bark",
      "leaf",
      "whole",
    ]);
  });

  it("offers GPS retry after a fix failure and recovers", async () => {
    const loc = jest.requireMock("expo-location") as {
      getCurrentPositionAsync: jest.Mock;
    };
    loc.getCurrentPositionAsync.mockRejectedValueOnce(new Error("no fix"));
    const { getByTestId, getByText, queryByTestId } = render(
      <CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />,
    );
    await waitFor(() => expect(getByTestId("retry-gps-button")).toBeTruthy());
    expect(queryByTestId("analyze-button")).toBeTruthy();
    fireEvent.press(getByTestId("retry-gps-button"));
    await waitFor(() => expect(getByText(/Position capturée/)).toBeTruthy());
  });
});
