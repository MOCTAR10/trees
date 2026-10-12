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

    spy.mockRestore();
  });
});
