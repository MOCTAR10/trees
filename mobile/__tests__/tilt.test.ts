import { cameraElevationDeg, clinometerHeight, isLevel, rollDeg } from "../src/utils/tilt";

describe("tilt helpers", () => {
  it("reads the camera elevation from the pitch", () => {
    expect(cameraElevationDeg(Math.PI / 2)).toBeCloseTo(0);
    expect(cameraElevationDeg(Math.PI / 2 + Math.PI / 6)).toBeCloseTo(30);
    expect(cameraElevationDeg(Math.PI / 2 - Math.PI / 18)).toBeCloseTo(-10);
    expect(rollDeg(Math.PI / 36)).toBeCloseTo(5);
  });

  it("accepts only an upright, non-leaning phone as level", () => {
    expect(isLevel(1, 1)).toBe(true);
    expect(isLevel(1, 5)).toBe(false);
    expect(isLevel(12, 0)).toBe(false);
  });

  it("computes a tree height with the tangent method", () => {
    // 20 m away, top at 55 deg, base at -5 deg -> 20*(tan55 + tan5) = 30.3 m
    expect(clinometerHeight(20, 55, -5)).toBeCloseTo(30.3, 1);
    // standing on a slope below the tree: base above the horizon
    expect(clinometerHeight(15, 60, 4)).toBeCloseTo(24.9, 1);
  });

  it("rejects sightings that cannot describe a standing tree", () => {
    expect(clinometerHeight(0, 50, -5)).toBeNull();
    expect(clinometerHeight(20, -5, 50)).toBeNull();
    expect(clinometerHeight(20, 89.5, -5)).toBeNull();
    expect(clinometerHeight(1, 10, 5)).toBeNull(); // 0.09 m: below breast height
  });
});
