jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    bytes() {
      return Promise.resolve(new Uint8Array());
    }
  },
}));

import { processScanV1 } from "../src/api/client";

describe("processScanV1", () => {
  it("appends each shot as an expo-file-system File part (WinterCG-safe)", async () => {
    const appended: { name: string; value: unknown; filename?: string }[] = [];
    const spy = jest
      .spyOn(FormData.prototype, "append")
      .mockImplementation((name, value, filename) => {
        appended.push({ name, value, filename });
      });

    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await processScanV1({
      shots: [
        {
          image: { uri: "file:///doc/bark.jpg", name: "bark.jpg", type: "image/jpeg" },
          organ: "bark",
        },
        {
          image: { uri: "file:///doc/leaf.jpg", name: "leaf.jpg", type: "image/jpeg" },
          organ: "leaf",
          azimuth: 90,
        },
      ],
      latitude: 0.4,
      longitude: 9.4,
      arDepthM: 1.2,
    });

    const images = appended.filter((part) => part.name === "images");
    expect(images).toHaveLength(2);
    expect((images[0].value as { uri: string }).uri).toBe("file:///doc/bark.jpg");
    expect((images[1].value as { uri: string }).uri).toBe("file:///doc/leaf.jpg");
    expect(appended.filter((part) => part.name === "organs").map((part) => part.value)).toEqual([
      "bark",
      "leaf",
    ]);
    expect(appended.some((part) => part.name === "azimuths" && part.value === "90")).toBe(true);
    expect(appended.find((part) => part.name === "ar_depth_m")?.value).toBe("1.2");
    expect(appended.some((part) => part.name === "circumference_cm")).toBe(false);
    expect(appended.some((part) => part.name === "focal_35mm")).toBe(false);

    spy.mockRestore();
  });

  it("sends field measurements and the DBH shot focal length", async () => {
    const appended: { name: string; value: unknown }[] = [];
    const spy = jest
      .spyOn(FormData.prototype, "append")
      .mockImplementation((name, value) => {
        appended.push({ name, value });
      });
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await processScanV1({
      shots: [
        {
          image: { uri: "file:///doc/bark.jpg", name: "bark.jpg", type: "image/jpeg" },
          organ: "bark",
          focal35mm: 13,
        },
        {
          image: { uri: "file:///doc/dbh.jpg", name: "dbh.jpg", type: "image/jpeg" },
          organ: "dbh",
          focal35mm: 26,
        },
      ],
      latitude: 0.4,
      longitude: 9.4,
      circumferenceCm: 196,
      measuredHeightM: 31.5,
      heightSource: "clinometer",
      treeCode: " GA-DEMO-005 ",
    });

    const value = (name: string) => appended.find((part) => part.name === name)?.value;
    expect(value("organs")).toBe("bark");
    expect(appended.filter((part) => part.name === "organs").map((p) => p.value)).toEqual([
      "bark",
      "dbh",
    ]);
    expect(value("focal_35mm")).toBe("26");
    expect(value("circumference_cm")).toBe("196");
    expect(value("measured_height_m")).toBe("31.5");
    expect(value("height_source")).toBe("clinometer");
    expect(value("tree_code")).toBe("GA-DEMO-005");
    expect(value("ar_depth_m")).toBeUndefined();

    spy.mockRestore();
  });
});
