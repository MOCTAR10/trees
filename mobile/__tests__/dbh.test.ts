import { dbhFromEdges, focalPx, isPlausibleDbh, moveEdge } from "../src/utils/dbh";

/** Edges of a circular trunk as seen by a pinhole camera (fractions of width). */
function edgesFor(diameterCm: number, distanceM: number, f: number, width: number, offsetPx = 0) {
  const r = diameterCm / 200;
  const alpha = Math.asin(r / (distanceM + r));
  const axis = Math.atan(offsetPx / f);
  const c = width / 2;
  return {
    left: (c + f * Math.tan(axis - alpha)) / width,
    right: (c + f * Math.tan(axis + alpha)) / width,
  };
}

describe("on-phone DBH from operator edges", () => {
  const W = 4032;
  const H = 3024;
  const f = focalPx(26, W, H);

  it.each([0, 600, -900])("recovers a 55 cm trunk at 2 m (offset %p px)", (offset) => {
    const e = edgesFor(55, 2, f, W, offset);
    expect(dbhFromEdges({ ...e, widthPx: W, heightPx: H, focal35mm: 26, distanceM: 2 })).toBeCloseTo(55, 6);
  });

  it("matches the server's 35 mm focal conversion", () => {
    expect(f).toBeGreaterThan(2950);
    expect(f).toBeLessThan(3100);
  });

  it("refuses impossible inputs and flags implausible sizes", () => {
    expect(dbhFromEdges({ left: 0.6, right: 0.4, widthPx: W, heightPx: H, distanceM: 2 })).toBeNull();
    expect(dbhFromEdges({ left: 0.4, right: 0.6, widthPx: W, heightPx: H, distanceM: 0 })).toBeNull();
    expect(isPlausibleDbh(2)).toBe(false);
    expect(isPlausibleDbh(55)).toBe(true);
    expect(isPlausibleDbh(null)).toBe(false);
  });
});


describe("dragging an edge line", () => {
  const edges = { left: 0.35, right: 0.65 };

  it("moves by the dragged share of the displayed photo", () => {
    expect(moveEdge(edges, "left", 0.35, 40, 400).left).toBeCloseTo(0.45);
    expect(moveEdge(edges, "right", 0.65, -20, 400).right).toBeCloseTo(0.6);
  });

  it("never leaves the photo nor crosses the other line", () => {
    expect(moveEdge(edges, "left", 0.35, -1000, 400).left).toBe(0);
    expect(moveEdge(edges, "right", 0.65, 1000, 400).right).toBe(1);
    expect(moveEdge(edges, "left", 0.35, 1000, 400).left).toBeCloseTo(0.63);
    expect(moveEdge(edges, "right", 0.65, -1000, 400).right).toBeCloseTo(0.37);
  });

  it("ignores drags before the photo is laid out", () => {
    expect(moveEdge(edges, "left", 0.35, 50, 0)).toBe(edges);
  });
});
