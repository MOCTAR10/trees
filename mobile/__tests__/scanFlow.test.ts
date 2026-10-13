import { codeSidePx, plateDistanceFromPreview, previewFraction } from "../src/utils/scanFlow";

describe("scanFlow helpers", () => {
  it("maps photo fractions to a narrower cover preview", () => {
    expect(previewFraction(0.35, 300, 400)).toBeCloseTo(0.35);
    expect(previewFraction(0.5, 300, 600)).toBeCloseTo(0.5);
    expect(previewFraction(0.35, 300, 600)).toBeCloseTo(0.275);
  });

  it("averages the four sides of a detected code", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ];
    expect(codeSidePx({ cornerPoints: pts })).toBeCloseTo(40);
    expect(codeSidePx({ bounds: { size: { width: 30, height: 50 } } })).toBeCloseTo(40);
    expect(codeSidePx({})).toBeNull();
  });

  it("estimates the plate distance and rejects absurd values", () => {
    const d = plateDistanceFromPreview(40, 300, 400);
    expect(d).not.toBeNull();
    expect(d as number).toBeGreaterThan(0.3);
    const near = plateDistanceFromPreview(20, 300, 400) as number;
    expect(near).toBeCloseTo((d as number) * 2, 5);
    expect(plateDistanceFromPreview(2000, 300, 400)).toBeNull();
    expect(plateDistanceFromPreview(40, 0, 400)).toBeNull();
  });
});
