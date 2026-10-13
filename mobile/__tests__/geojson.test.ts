import { compactFr, toPolygons } from "../src/utils/geojson";

describe("geojson helpers", () => {
  it("turns Polygon and MultiPolygon outer rings into lat/lng arrays", () => {
    const square = [
      [11, -1],
      [12, -1],
      [12, 0],
      [11, -1],
    ];
    expect(toPolygons({ type: "Polygon", coordinates: [square] })[0][1]).toEqual({
      latitude: -1,
      longitude: 12,
    });
    expect(toPolygons({ type: "MultiPolygon", coordinates: [[square], [square]] })).toHaveLength(2);
    expect(toPolygons({ type: "Point", coordinates: [1, 2] })).toEqual([]);
    expect(toPolygons(null)).toEqual([]);
  });

  it("formats large figures compactly in French", () => {
    expect(compactFr(22669515)).toBe("22,7 M");
    expect(compactFr(6645467131.8)).toBe("6,6 Md");
    expect(compactFr(24673)).toBe("24,7 k");
    expect(compactFr(null)).toBe("—");
  });
});
