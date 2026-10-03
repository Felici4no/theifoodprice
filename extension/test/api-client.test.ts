import { describe, expect, it, vi } from "vitest";
import { createApiClient, isAllowedBackendUrl } from "../src/api/client";

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("isAllowedBackendUrl", () => {
  it.each([
    ["http://localhost:3000", true],
    ["http://127.0.0.1:8080/", true],
    ["https://localhost:3000", false],
    ["http://example.com", false],
    ["http://localhost.evil.com", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => expect(isAllowedBackendUrl(url)).toBe(expected));
});

describe("createApiClient", () => {
  it("sends only the backend token, without credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ observationId: "o", itemId: "i", warnings: [], alertsFired: 0 }, 201));
    const api = createApiClient({ backendUrl: "http://localhost:3000/", token: "T" }, fetchMock);
    await api.collect({
      pageUrl: "https://www.ifood.com.br/x",
      observedAt: "2026-10-03T12:00:00Z",
      merchant: { name: "M" },
      item: { name: "I" },
      pricing: { currentPrice: 100 },
      extraction: { source: "dom", confidence: 0.7 },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/collect/browser");
    expect(init.credentials).toBe("omit");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer T" });
  });

  it("surfaces backend errors with status", async () => {
    const api = createApiClient(
      { backendUrl: "http://localhost:3000", token: "bad" },
      vi.fn().mockResolvedValue(ok({ error: "Unauthorized" }, 401)),
    );
    await expect(api.ping()).rejects.toMatchObject({ message: "Unauthorized", status: 401 });
  });

  it("reports an unreachable backend", async () => {
    const api = createApiClient(
      { backendUrl: "http://localhost:3000", token: "t" },
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    await expect(api.ping()).rejects.toMatchObject({ status: 0 });
  });

  it("refuses non-local backends", () => {
    expect(() => createApiClient({ backendUrl: "http://example.com", token: "t" })).toThrow();
  });

  it("builds dashboard links on the backend origin", () => {
    const api = createApiClient({ backendUrl: "http://localhost:3000", token: "t" }, vi.fn());
    expect(api.dashboardUrl("/history?item=x")).toBe("http://localhost:3000/history?item=x");
  });
});
