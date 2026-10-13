import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert, Image } from "react-native";

const cameraProps: { current: any } = { current: null };

type MotionListener = (data: { rotation: { alpha: number; beta: number; gamma: number } }) => void;
const motion: { listener: MotionListener | null; all: MotionListener[] } = {
  listener: null,
  all: [],
};
const emit = (beta: number, gamma = 0) =>
  act(() => {
    motion.all.forEach((cb) => cb({ rotation: { alpha: 0, beta, gamma } }));
  });

jest.mock("expo-sensors", () => ({
  DeviceMotion: {
    isAvailableAsync: jest.fn(async () => true),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((cb: MotionListener) => {
      motion.listener = cb;
      motion.all.push(cb);
      return {
        remove: jest.fn(() => {
          motion.all = motion.all.filter((l) => l !== cb);
        }),
      };
    }),
  },
}));

jest.mock("expo-camera", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  return {
    CameraView: ReactLib.forwardRef((props: any, ref: any) => {
      cameraProps.current = props;
      ReactLib.useImperativeHandle(ref, () => ({
        takePictureAsync: async () => ({
          uri: "file:///photo.jpg",
          exif: { FocalLenIn35mmFilm: 26 },
        }),
      }));
      ReactLib.useEffect(() => {
        props.onCameraReady?.();
      }, []);
      return ReactLib.createElement(View, { testID: "camera-view" });
    }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

const mockSensor = {
  available: false,
  reading: null as null | { distanceM: number; confidence: number; source: string },
};

jest.mock("../modules/depth-sensor", () => ({
  isDepthSensorAvailable: jest.fn(async () => mockSensor.available),
  measureCenterDistance: jest.fn(async () => mockSensor.reading),
}));

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3, High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 0.4162, longitude: 9.4541 },
  })),
}));

import CaptureScreen from "../src/screens/CaptureScreen";

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let sizeSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockSensor.available = false;
  mockSensor.reading = null;
  motion.listener = null;
  motion.all = [];
  globalThis.fetch = jest.fn(async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;
  sizeSpy = jest
    .spyOn(Image, "getSize")
    .mockImplementation((_uri: unknown, ok: unknown) => (ok as (w: number, h: number) => void)(3024, 4032));
});

afterEach(() => {
  sizeSpy.mockRestore();
});

type View = ReturnType<typeof render>;

async function ready(view: View) {
  await waitFor(() => expect(view.getByText(/Position capturée/)).toBeTruthy());
}

/** Whole tree, bark, leaf: each capture moves on to the next photo by itself. */
async function captureCore(view: View) {
  for (let i = 0; i < 3; i += 1) {
    fireEvent.press(view.getByTestId("capture-button"));
    await flush();
  }
}

async function captureDbh(view: View) {
  expect(view.getByTestId("dbh-guide")).toBeTruthy();
  fireEvent.press(view.getByTestId("capture-button"));
  await flush();
  await waitFor(() => expect(view.getByTestId("dbh-panel")).toBeTruthy());
}

function submitted(onCaptured: jest.Mock) {
  expect(onCaptured).toHaveBeenCalledTimes(1);
  return onCaptured.mock.calls[0][0];
}

describe("CaptureScreen guided flow", () => {
  it("walks the three photos then the diameter on its own, and sends the confirmed edges", async () => {
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    expect(view.queryByTestId("mode-quick")).toBeNull();
    expect(view.getByText("Arbre entier")).toBeTruthy();

    await captureCore(view);
    expect(view.getByText("Diamètre à hauteur de poitrine")).toBeTruthy();
    await captureDbh(view);
    await waitFor(() => expect(view.getByTestId("edge-adjuster")).toBeTruthy());

    fireEvent.press(view.getByTestId("distance-2"));
    expect(view.getByTestId("edge-dbh").props.children).toMatch(/DBH ≈/);
    fireEvent.press(view.getByTestId("dbh-confirm"));
    await flush();
    expect(view.getByTestId("review")).toBeTruthy();
    expect(view.getByTestId("review-dbh").props.children).toMatch(/DBH ≈/);

    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    const result = submitted(onCaptured);
    expect(result.latitude).toBeCloseTo(0.4162);
    expect(result.arDepthM).toBe(2);
    expect(result.shots.map((s: { organ: string }) => s.organ)).toEqual(["whole", "bark", "leaf", "dbh"]);
    expect(result.shots[0].focal35mm).toBe(26);
    expect(result).toMatchObject({ edgeLeft: 0.35, edgeRight: 0.65 });
  });

  it("blocks the analysis until a distance or a reference measure is given", async () => {
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    fireEvent.press(view.getByTestId("rail-review"));
    expect(view.getByTestId("block-reason").props.children).toMatch(/Photos requises : Arbre, Écorce, Feuilles/);

    fireEvent.press(view.getByTestId("rail-whole"));
    await captureCore(view);
    fireEvent.press(view.getByTestId("skip-button"));
    await flush();
    expect(view.getByTestId("block-reason").props.children).toBe(
      "Indiquez la distance au tronc (étape Diamètre)",
    );
    fireEvent.press(view.getByTestId("analyze-button"));
    expect(onCaptured).not.toHaveBeenCalled();
  });

  it("accepts a tape circumference and a typed height without any distance", async () => {
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    await captureDbh(view);

    fireEvent.press(view.getByTestId("reference-toggle"));
    expect(view.getByTestId("measure-tape").props.accessibilityState.selected).toBe(true);
    fireEvent.changeText(view.getByTestId("reference-input"), "196");
    fireEvent.press(view.getByTestId("dbh-confirm"));
    await flush();
    expect(view.getByTestId("review-dbh").props.children).toBe("Ruban : 196 cm de tour");

    fireEvent.press(view.getByTestId("height-edit"));
    fireEvent.changeText(view.getByTestId("height-input"), "31.5");
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    const result = submitted(onCaptured);
    expect(result.circumferenceCm).toBe(196);
    expect(result.caliperDbhCm).toBeUndefined();
    expect(result.arDepthM).toBeUndefined();
    expect(result.measuredHeightM).toBeCloseTo(31.5);
    expect(result.heightSource).toBe("manual");
  });

  it("does not send edges the operator never confirmed", async () => {
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    await captureDbh(view);
    fireEvent.press(view.getByTestId("distance-other"));
    fireEvent.changeText(view.getByTestId("depth-input"), "2,1");
    fireEvent.press(view.getByTestId("rail-review"));
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    const result = submitted(onCaptured);
    expect(result.arDepthM).toBeCloseTo(2.1);
    expect(result.edgeLeft).toBeUndefined();
  });

  it("sends the edges the operator dragged", async () => {
    const EdgeAdjuster = require("../src/components/EdgeAdjuster").default;
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    await captureDbh(view);
    await waitFor(() => expect(view.getByTestId("edge-adjuster")).toBeTruthy());
    fireEvent.press(view.getByTestId("distance-2"));
    act(() => view.UNSAFE_getByType(EdgeAdjuster).props.onChange({ left: 0.4, right: 0.6 }));
    fireEvent.press(view.getByTestId("dbh-confirm"));
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    expect(submitted(onCaptured)).toMatchObject({ edgeLeft: 0.4, edgeRight: 0.6, arDepthM: 2 });
  });

  it("adds optional identification views from the review", async () => {
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    await captureDbh(view);
    fireEvent.press(view.getByTestId("distance-2"));
    fireEvent.press(view.getByTestId("dbh-confirm"));
    fireEvent.press(view.getByTestId("extra-flower"));
    expect(view.getByText("Fleur (optionnel)")).toBeTruthy();
    fireEvent.press(view.getByTestId("capture-button"));
    await flush();
    expect(view.getByTestId("review")).toBeTruthy();
    expect(view.getByTestId("extra-flower").props.accessibilityState.selected).toBe(true);
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    expect(submitted(onCaptured).shots.map((s: { organ: string }) => s.organ)).toEqual([
      "whole",
      "bark",
      "leaf",
      "dbh",
      "flower",
    ]);
  });

  it("lets the server estimate the distance when its AI is available", async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ ai_segmentation: true, ai_distance: true }),
    })) as unknown as typeof fetch;
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    fireEvent.press(view.getByTestId("skip-button"));
    await waitFor(() => expect(view.getByTestId("ai-status").props.children).toMatch(/active/));
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    expect(submitted(onCaptured).arDepthM).toBeUndefined();
  });
});

describe("CaptureScreen field helpers", () => {
  it("offers live capture only, no gallery import", async () => {
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />);
    await ready(view);
    expect(view.queryByTestId("import-button")).toBeNull();
  });

  it("explains why the diameter is taken at 1.30 m", async () => {
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    expect(view.getByText("1,30 m du sol")).toBeTruthy();
    fireEvent.press(view.getByTestId("dbh-why"));
    expect(view.getByText("Pourquoi mesurer à 1,30 m ?")).toBeTruthy();
    fireEvent.press(view.getByTestId("dbh-why-ok"));
    expect(view.queryByTestId("dbh-why-card")).toBeNull();
  });

  it("zooms only on leaves, flowers and fruit", async () => {
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />);
    await ready(view);
    expect(view.queryByTestId("zoom-button")).toBeNull();
    fireEvent.press(view.getByTestId("rail-leaf"));
    fireEvent.press(view.getByTestId("zoom-button"));
    expect(cameraProps.current.zoom).toBeGreaterThan(0);
    fireEvent.press(view.getByTestId("rail-dbh"));
    expect(cameraProps.current.zoom).toBe(0);
    expect(view.queryByTestId("zoom-button")).toBeNull();
  });

  it("handles the Android back button inside the scanner", async () => {
    const { BackHandler } = require("react-native");
    const handlers: Array<() => boolean> = [];
    const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation((...args: unknown[]) => {
      handlers.push(args[1] as () => boolean);
      return { remove: jest.fn() };
    });
    const onBack = jest.fn();
    render(<CaptureScreen onCaptured={jest.fn()} onBack={onBack} />);
    await flush();
    let handled = false;
    act(() => {
      handled = handlers[handlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("CaptureScreen for a project", () => {
  it("shows the chantier and sends its id with the scan", async () => {
    const onCaptured = jest.fn();
    const view = render(
      <CaptureScreen
        onCaptured={onCaptured}
        onBack={jest.fn()}
        project={{ id: 7, title: "Chantier Démo", kind: "chantier" }}
      />,
    );
    await ready(view);
    expect(view.getByTestId("scan-project-banner")).toHaveTextContent("Chantier · Chantier Démo");
    await captureCore(view);
    await captureDbh(view);
    fireEvent.press(view.getByTestId("distance-2"));
    fireEvent.press(view.getByTestId("dbh-confirm"));
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    expect(submitted(onCaptured).projectId).toBe(7);
  });

  it("sends no project for a free scan", async () => {
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    expect(view.queryByTestId("scan-project-banner")).toBeNull();
    await captureCore(view);
    await captureDbh(view);
    fireEvent.press(view.getByTestId("distance-2"));
    fireEvent.press(view.getByTestId("dbh-confirm"));
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    expect(submitted(onCaptured).projectId).toBeUndefined();
  });
});

describe("CaptureScreen controls", () => {
  it("keeps the torch off by default and toggles on press", async () => {
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />);
    await flush();
    expect(view.getByTestId("torch-toggle").props.accessibilityState.checked).toBe(false);
    fireEvent.press(view.getByTestId("torch-toggle"));
    expect(view.getByTestId("torch-toggle").props.accessibilityState.checked).toBe(true);
  });

  it("goes back immediately when no shots were taken", async () => {
    const onBack = jest.fn();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={onBack} />);
    await flush();
    fireEvent.press(view.getByTestId("back-button"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("asks for confirmation before discarding shots", async () => {
    const onBack = jest.fn();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={onBack} />);
    await flush();
    fireEvent.press(view.getByTestId("capture-button"));
    await flush();
    fireEvent.press(view.getByTestId("back-button"));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>;
    buttons.find((b) => b.onPress)?.onPress?.();
    expect(onBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("offers GPS retry after a fix failure and recovers", async () => {
    const loc = jest.requireMock("expo-location") as { getCurrentPositionAsync: jest.Mock };
    loc.getCurrentPositionAsync.mockRejectedValueOnce(new Error("no fix"));
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByTestId("retry-gps-button")).toBeTruthy());
    fireEvent.press(view.getByTestId("retry-gps-button"));
    await ready(view);
  });
});

describe("CaptureScreen QR plate", () => {
  it("links the tree as soon as the camera sees its plate, and lets the server measure the distance", async () => {
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    expect(cameraProps.current.barcodeScannerSettings.barcodeTypes).toContain("qr");
    act(() => cameraProps.current.onBarcodeScanned({ data: " GA-DEMO-005 " }));
    expect(view.getByText("Arbre lié : GA-DEMO-005")).toBeTruthy();
    expect(view.getByTestId("toast").props.children).toBe("Plaque QR détectée · GA-DEMO-005");

    await captureCore(view);
    act(() => cameraProps.current.onBarcodeScanned({ data: "GA-DEMO-005" }));
    await captureDbh(view);
    expect(view.getByTestId("distance-auto")).toBeTruthy();
    fireEvent.press(view.getByTestId("dbh-confirm"));
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    const result = submitted(onCaptured);
    expect(result.treeCode).toBe("GA-DEMO-005");
    expect(result.arDepthM).toBeUndefined();

    fireEvent.press(view.getByTestId("tree-unlink"));
    expect(view.queryByTestId("tree-chip")).toBeNull();
  });

  it("scans a plate on demand from the review", async () => {
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />);
    await ready(view);
    fireEvent.press(view.getByTestId("rail-review"));
    fireEvent.press(view.getByTestId("qr-button"));
    expect(view.getByTestId("qr-overlay")).toBeTruthy();
    act(() => cameraProps.current.onBarcodeScanned({ data: "GA-DEMO-007" }));
    expect(view.queryByTestId("qr-overlay")).toBeNull();
    expect(view.getByTestId("review")).toBeTruthy();
    expect(view.getByText("Arbre lié : GA-DEMO-007")).toBeTruthy();
  });
});

describe("CaptureScreen measurement helpers", () => {
  it("shows a live level on the DBH step and records a clinometer height", async () => {
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    expect(view.getByTestId("dbh-guide")).toBeTruthy();
    await waitFor(() => expect(motion.listener).not.toBeNull());
    emit(Math.PI / 2, 0.15);
    expect(view.getByTestId("level-indicator").props.children).toMatch(/Redressez/);
    emit(Math.PI / 2, 0);
    expect(view.getByTestId("level-indicator").props.children).toBe("Téléphone droit ✓");

    await captureDbh(view);
    fireEvent.press(view.getByTestId("distance-2"));
    fireEvent.press(view.getByTestId("dbh-confirm"));
    await flush();

    const before = motion.all.length;
    fireEvent.press(view.getByTestId("clinometer-button"));
    await waitFor(() => expect(motion.all.length).toBeGreaterThan(before));
    fireEvent.changeText(view.getByTestId("clino-distance"), "20");
    fireEvent.press(view.getByTestId("clino-start"));
    emit(Math.PI / 2 + (55 * Math.PI) / 180);
    fireEvent.press(view.getByTestId("clino-capture"));
    emit(Math.PI / 2 - (5 * Math.PI) / 180);
    fireEvent.press(view.getByTestId("clino-capture"));
    fireEvent.press(view.getByTestId("clino-use"));
    expect(view.getByTestId("review-height").props.children).toBe("30,3 m · clinomètre");

    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    const result = submitted(onCaptured);
    expect(result.measuredHeightM).toBeCloseTo(30.3);
    expect(result.heightSource).toBe("clinometer");
  });

  it("tells the operator whether the server AI is active and why not", async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ ai_segmentation: false, ai_distance: false, ai_configured: true, ai_off_reason: "memory" }),
    })) as unknown as typeof fetch;
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />);
    await flush();
    fireEvent.press(view.getByTestId("rail-review"));
    await waitFor(() => expect(view.getByTestId("ai-status").props.children).toMatch(/insuffisante/));
  });
});

describe("CaptureScreen native depth sensor", () => {
  it("hides the sensor button in Expo Go", async () => {
    const view = render(<CaptureScreen onCaptured={jest.fn()} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    await captureDbh(view);
    expect(view.queryByTestId("sensor-button")).toBeNull();
  });

  it("measures the distance with LiDAR at the DBH capture and sends its source", async () => {
    mockSensor.available = true;
    mockSensor.reading = { distanceM: 2.04, confidence: 0.92, source: "lidar" };
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    await captureDbh(view);
    await waitFor(() => expect(view.getByTestId("distance-auto")).toBeTruthy());
    expect(view.getByTestId("sensor-note").props.children).toMatch(/LiDAR/);
    fireEvent.press(view.getByTestId("dbh-confirm"));
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    expect(submitted(onCaptured)).toMatchObject({ arDepthM: 2.04, depthSource: "lidar" });
  });

  it("typing a distance afterwards drops the sensor source", async () => {
    mockSensor.available = true;
    mockSensor.reading = { distanceM: 2.04, confidence: 0.92, source: "arcore" };
    const onCaptured = jest.fn();
    const view = render(<CaptureScreen onCaptured={onCaptured} onBack={jest.fn()} />);
    await ready(view);
    await captureCore(view);
    await captureDbh(view);
    await waitFor(() => expect(view.getByTestId("distance-auto")).toBeTruthy());
    fireEvent.press(view.getByTestId("distance-edit"));
    fireEvent.press(view.getByTestId("distance-other"));
    fireEvent.changeText(view.getByTestId("depth-input"), "2.5");
    fireEvent.press(view.getByTestId("dbh-confirm"));
    fireEvent.press(view.getByTestId("analyze-button"));
    await flush();
    const result = submitted(onCaptured);
    expect(result.arDepthM).toBeCloseTo(2.5);
    expect(result.depthSource).toBeUndefined();
  });
});
