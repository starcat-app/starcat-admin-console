import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfigStore } from "./config-store.js";
import { createServicesRoutes } from "./routes-services.js";
import { serviceIds } from "./types.js";

afterEach(() => vi.unstubAllGlobals());

describe("service operations routes", () => {
  it("aggregates fixed metrics endpoints without returning credentials", async () => {
    const store = await configuredStore();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith("/summary"))
        return jsonResponse({
          schema_version: 1,
          data: {
            service: "test",
            request_count: 12,
            error_count: 1,
            error_rate: 1 / 12,
            average_ms: 4,
            p95_ms: 10,
          },
        });
      if (url.pathname.endsWith("/timeseries"))
        return jsonResponse({
          schema_version: 1,
          data: {
            service: "test",
            metric: "requests",
            interval: "5m0s",
            points: [{ timestamp: "2026-08-27T00:00:00Z", value: 12 }],
          },
        });
      if (url.pathname.endsWith("/routes"))
        return jsonResponse({
          schema_version: 1,
          data: [{ method: "GET", route: "/api/v1/ping", request_count: 12 }],
        });
      return jsonResponse({
        schema_version: 1,
        data: [{ status_class: "2xx", request_count: 12 }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await createServicesRoutes(store).request(
      "/observability?environment=test&range=24h&metric=requests",
    );
    expect(response.status).toBe(200);
    const payload = await response.text();
    expect(payload).not.toContain("test-secret");
    const parsed = JSON.parse(payload) as {
      data: Array<{ ok: boolean; summary: { request_count: number } }>;
    };
    expect(parsed.data).toHaveLength(6);
    expect(
      parsed.data.every((item) => item.ok && item.summary.request_count === 12),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(24);
  });

  it("loads only the resource path registered for the service", async () => {
    const store = await configuredStore();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        expect(new URL(request.url).pathname).toBe("/internal/shares");
        expect(new URL(request.url).search).toBe("?sort=recent&limit=50");
        expect(request.headers.get("authorization")).toBe("Bearer test-secret");
        return jsonResponse({
          schema_version: 1,
          data: [{ full_name: "starcat-app/Starcat" }],
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await createServicesRoutes(store).request(
      "/sharing/resources/recent-shares?environment=test",
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("test-secret");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("deduplicates statistics that share the same upstream path", async () => {
    const store = await configuredStore();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/healthz") return new Response("ok");
      if (url.pathname === "/api/v1/ping")
        return jsonResponse({ schema_version: 1, data: { ok: true } });
      return jsonResponse({
        schema_version: 1,
        data: {
          total_shares: 4,
          active_shares: 3,
          total_visits: 8,
          created_7d: 2,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await createServicesRoutes(store).request(
      "/sharing?environment=test",
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: { stats: Array<{ value: number }> };
    };
    expect(payload.data.stats.map((stat) => stat.value)).toEqual([4, 3, 8, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

async function configuredStore() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "starcat-admin-services-"),
  );
  const store = new ConfigStore(directory);
  for (const service of serviceIds)
    await store.updateServiceSecret("test", service, "apiKey", "test-secret");
  return store;
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
