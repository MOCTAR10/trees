type DepthModule = typeof import("../modules/depth-sensor");

function loadWith(native: unknown): DepthModule {
  let mod: DepthModule | undefined;
  jest.isolateModules(() => {
    jest.doMock("expo-modules-core", () => ({
      ...jest.requireActual("expo-modules-core"),
      requireOptionalNativeModule: () => native,
    }));
    mod = require("../modules/depth-sensor");
  });
  return mod as DepthModule;
}

describe("depth-sensor module", () => {
  it("is simply unavailable in Expo Go (no native module)", async () => {
    const mod = loadWith(null);
    await expect(mod.isDepthSensorAvailable()).resolves.toBe(false);
    await expect(mod.measureCenterDistance()).resolves.toBeNull();
  });

  it("returns plausible readings and drops implausible ones", async () => {
    const native = {
      isAvailableAsync: jest.fn(async () => true),
      measureCenterAsync: jest
        .fn()
        .mockResolvedValueOnce({ distanceM: 2.04, confidence: 0.92, source: "lidar" })
        .mockResolvedValueOnce({ distanceM: 25, confidence: 0.9, source: "lidar" })
        .mockResolvedValueOnce({ distanceM: 2.0, confidence: 0.1, source: "arcore" })
        .mockRejectedValueOnce(new Error("camera busy")),
    };
    const mod = loadWith(native);
    await expect(mod.isDepthSensorAvailable()).resolves.toBe(true);
    await expect(mod.measureCenterDistance()).resolves.toEqual({
      distanceM: 2.04,
      confidence: 0.92,
      source: "lidar",
    });
    await expect(mod.measureCenterDistance()).resolves.toBeNull(); // 25 m: out of range
    await expect(mod.measureCenterDistance()).resolves.toBeNull(); // low confidence
    await expect(mod.measureCenterDistance()).resolves.toBeNull(); // native error
  });
});
