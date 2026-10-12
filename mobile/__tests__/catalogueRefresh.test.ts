jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

import {
  FOREGROUND_REFRESH_MIN_MS,
  shouldForegroundRefresh,
} from "../src/storage/catalogueStore";

describe("shouldForegroundRefresh", () => {
  it("never refreshes on a cold store", () => {
    expect(shouldForegroundRefresh(false, null)).toBe(false);
    expect(shouldForegroundRefresh(false, new Date().toISOString())).toBe(false);
  });

  it("refreshes once when never synced", () => {
    expect(shouldForegroundRefresh(true, null)).toBe(true);
    expect(shouldForegroundRefresh(true, "not-a-date")).toBe(true);
  });

  it("throttles refetches within the quiet window (camera returns)", () => {
    const now = Date.now();
    expect(
      shouldForegroundRefresh(true, new Date(now - 60_000).toISOString(), now),
    ).toBe(false);
    expect(
      shouldForegroundRefresh(
        true,
        new Date(now - FOREGROUND_REFRESH_MIN_MS - 1000).toISOString(),
        now,
      ),
    ).toBe(true);
  });
});
