import { pingGateway, setGatewayReachable, timedFetch } from "../src/api/client";

afterEach(() => {
  setGatewayReachable(null);
});

function hangingFetch(): typeof fetch {
  return jest.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_res, rej) => {
    init?.signal?.addEventListener("abort", () => {
      rej(new DOMException("This operation was aborted", "AbortError"));
    });
  })) as unknown as typeof fetch;
}

describe("timedFetch", () => {
  it("fails fast with a timeout error when the server black-holes", async () => {
    globalThis.fetch = hangingFetch();
    await expect(timedFetch("http://192.168.1.81:3000/api/auth/me", {}, 50)).rejects.toThrow(
      /Délai dépassé/,
    );
  });

  it("passes successful responses through untouched", async () => {
    const resp = { ok: true, status: 200 };
    globalThis.fetch = jest.fn(async () => resp) as unknown as typeof fetch;
    await expect(timedFetch("http://x/health", {}, 50)).resolves.toBe(resp);
  });

  it("re-throws non-timeout failures as-is", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(timedFetch("http://x/health", {}, 1000)).rejects.toThrow(
      "Network request failed",
    );
  });
});

describe("pingGateway", () => {
  it("returns false fast when the gateway black-holes", async () => {
    globalThis.fetch = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener("abort", () => {
            rej(new DOMException("aborted", "AbortError"));
          });
        }),
    ) as unknown as typeof fetch;
    await expect(pingGateway(40)).resolves.toBe(false);
  });

  it("returns true on a healthy gateway", async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    await expect(pingGateway(500)).resolves.toBe(true);
  });
});
