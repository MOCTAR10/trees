import { bboxFor, clusterPoints, regionForBox, zoomFor } from "../src/utils/mapMath";

const gabon = { latitude: -0.7, longitude: 11.6, latitudeDelta: 6, longitudeDelta: 6 };

describe("map maths", () => {
  it("derives a zoom level from the visible span", () => {
    expect(zoomFor(gabon)).toBeCloseTo(5.9, 1);
    expect(zoomFor({ ...gabon, longitudeDelta: 0.02 })).toBeGreaterThan(14);
  });

  it("pads and clamps the visible box", () => {
    const [w, s, e, n] = bboxFor(gabon, 0);
    expect([w, s, e, n]).toEqual([8.6, -3.7, 14.6, 2.3]);
    const world = bboxFor({ latitude: 0, longitude: 0, latitudeDelta: 400, longitudeDelta: 400 });
    expect(world[0]).toBeGreaterThanOrEqual(-180);
    expect(world[3]).toBeLessThanOrEqual(90);
  });

  it("clusters nearby scans and keeps distant ones apart", () => {
    const pts = [
      { latitude: -0.2, longitude: 11.5, item: "a" },
      { latitude: -0.2001, longitude: 11.5001, item: "b" },
      { latitude: 1.5, longitude: 13.0, item: "c" },
    ];
    const clusters = clusterPoints(pts, gabon);
    expect(clusters).toHaveLength(2);
    const big = clusters.find((c) => c.items.length === 2);
    expect(big?.items.sort()).toEqual(["a", "b"]);
    // zoomed in far enough, the two close scans separate
    expect(clusterPoints(pts, { ...gabon, longitudeDelta: 0.0005, latitudeDelta: 0.0005 })).toHaveLength(3);
  });

  it("frames a bounding box", () => {
    const r = regionForBox(11, -1, 12, 0);
    expect(r.latitude).toBeCloseTo(-0.5);
    expect(r.longitudeDelta).toBeCloseTo(1.3);
  });
});
