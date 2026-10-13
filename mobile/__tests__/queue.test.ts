jest.mock("@react-native-async-storage/async-storage", () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
    },
  };
});

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
}));

jest.mock("../src/api/client", () => ({
  processScanV1: jest.fn(),
  processScanV2: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

import * as client from "../src/api/client";
import { enqueue, flushQueue, isNetworkError, loadQueue } from "../src/storage/queue";

const handlers = {
  onV1Success: jest.fn(async () => undefined),
  onV2Success: jest.fn(async () => undefined),
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe("queue flush", () => {
  it("upgrades a legacy 3-view entry into organ-tagged shots", async () => {
    await enqueue({
      kind: "v1",
      id: "a",
      scan_id: "a",
      created_at: "t",
      latitude: 0.4,
      longitude: 9.4,
      ar_depth_m: 1.3,
      images: {
        trunk: { uri: "t", name: "t.jpg", type: "image/jpeg" },
        leaf: { uri: "l", name: "l.jpg", type: "image/jpeg" },
        habitat: { uri: "h", name: "h.jpg", type: "image/jpeg" },
      },
    } as never);

    (client.processScanV1 as jest.Mock).mockResolvedValue({});

    const res = await flushQueue(handlers);

    expect(res.synced).toBe(1);
    const arg = (client.processScanV1 as jest.Mock).mock.calls[0][0];
    expect(arg.shots.map((s: { organ: string }) => s.organ)).toEqual(["bark", "leaf", "whole"]);
    expect((await loadQueue()).length).toBe(0);
  });

  it("passes through new-format shots unchanged", async () => {
    await enqueue({
      kind: "v1",
      id: "b",
      scan_id: "b",
      created_at: "t",
      latitude: 1,
      longitude: 2,
      ar_depth_m: 1.3,
      shots: [
        { image: { uri: "a", name: "a.jpg", type: "image/jpeg" }, organ: "leaf" },
        {
          image: { uri: "c", name: "c.jpg", type: "image/jpeg" },
          organ: "bark",
          azimuth: 90,
        },
      ],
    });

    (client.processScanV1 as jest.Mock).mockResolvedValue({});

    await flushQueue(handlers);

    const arg = (client.processScanV1 as jest.Mock).mock.calls[0][0];
    expect(arg.shots).toHaveLength(2);
    expect(arg.shots[1]).toMatchObject({ organ: "bark", azimuth: 90 });
  });

  it("replays the field measurements captured offline", async () => {
    await enqueue({
      kind: "v1",
      id: "c",
      scan_id: "c",
      created_at: "t",
      latitude: 1,
      longitude: 2,
      measurements: { circumferenceCm: 196, measuredHeightM: 30, heightSource: "manual" },
      shots: [{ image: { uri: "d", name: "d.jpg", type: "image/jpeg" }, organ: "dbh" }],
    });
    (client.processScanV1 as jest.Mock).mockResolvedValue({});

    await flushQueue(handlers);

    const arg = (client.processScanV1 as jest.Mock).mock.calls[0][0];
    expect(arg).toMatchObject({
      circumferenceCm: 196,
      measuredHeightM: 30,
      heightSource: "manual",
      latitude: 1,
      longitude: 2,
    });
    expect(arg.arDepthM).toBeUndefined();
  });
});

describe("isNetworkError", () => {
  it("treats timeouts as network errors so the offline queue path triggers", () => {
    expect(isNetworkError(new Error("Délai dépassé (25s) : http://192.168.1.81:3000/api/v2"))).toBe(
      true,
    );
    expect(isNetworkError(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkError(new Error("V2 502: Génération du plan échouée"))).toBe(false);
  });
});
