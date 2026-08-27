import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { MemoryDataPlatformCatalog } from "./data-platform/catalog.js";
import type { DataPlatformProcessExecutor } from "./data-platform/process.js";
import { DataPlatformRuntime } from "./data-platform/runtime.js";
import { createDataPlatformRoutes } from "./routes-data-platform.js";

describe("data platform routes", () => {
  it("reports an explicit unavailable state without PostgreSQL configuration", async () => {
    const app = new Hono();
    app.route("/api/data-platform", createDataPlatformRoutes());

    const config = await app.request("/api/data-platform/config");
    const downloads = await app.request(
      "/api/data-platform/bigquery/downloads",
    );

    expect(await config.json()).toEqual({ data: { available: false } });
    expect(downloads.status).toBe(503);
  });

  it("validates SQL Lab input before creating a job", async () => {
    const runtime = new DataPlatformRuntime(
      new MemoryDataPlatformCatalog(),
      {
        trainerRoot: "/private/trainer",
        watchWorkspace: "/private/watch-workspace",
        pushWorkspace: "/private/push-workspace",
        billingProject: "starcat-test",
        location: "US",
      },
      new NoopExecutor(),
    );
    const app = new Hono();
    app.route("/api/data-platform", createDataPlatformRoutes(runtime));

    const invalid = await app.request(
      "/api/data-platform/bigquery/sql/dry-run",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "", maximumBytesBilled: 0 }),
      },
    );
    const valid = await app.request("/api/data-platform/bigquery/sql/dry-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1", maximumBytesBilled: 1_000 }),
    });

    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(202);
    expect(await valid.json()).toEqual({
      data: expect.objectContaining({
        actionId: "bigquery.sql-lab.dry-run",
        state: "queued",
      }),
    });
  });
});

class NoopExecutor implements DataPlatformProcessExecutor {
  async run() {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        schema_version: 1,
        operation: "dry_run",
        sql_sha256:
          "sha256:e004ebd5b5532a4b85984a62f8ad48a81aa3460c1ca07701f386135d72cdecf5",
        estimated_bytes: 0,
      }),
      stderr: "",
    };
  }
}
