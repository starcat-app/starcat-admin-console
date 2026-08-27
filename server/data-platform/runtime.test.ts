import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { MemoryDataPlatformCatalog } from "./catalog.js";
import type {
  DataPlatformProcessExecutor,
  ProcessRequest,
  ProcessResult,
} from "./process.js";
import { DataPlatformRuntime } from "./runtime.js";

const config = {
  trainerRoot: "/private/trainer",
  watchWorkspace: "/private/watch-workspace",
  pushWorkspace: "/private/push-workspace",
  billingProject: "starcat-test",
  location: "US",
};

describe("DataPlatformRuntime", () => {
  it("passes SQL through a private file and keeps only hashes in the catalog", async () => {
    const executor = new FakeExecutor();
    const runtime = new DataPlatformRuntime(
      new MemoryDataPlatformCatalog(),
      config,
      executor,
    );

    const queued = await runtime.createSqlLabJob("dry-run", {
      sql: "SELECT 1",
      maximumBytesBilled: 1_000,
    });
    const completed = await waitForTerminalJob(runtime, queued.jobId);

    expect(completed.state).toBe("succeeded");
    expect(completed.sqlHash).toMatch(/^sha256:/);
    expect(JSON.stringify(completed)).not.toContain("SELECT 1");
    expect(executor.sqlFromFile).toBe("SELECT 1");
    expect(executor.requests[0].args.join(" ")).not.toContain("SELECT 1");
    expect(runtime.result(queued.jobId)).toEqual(
      expect.objectContaining({ operation: "dry_run", estimated_bytes: 0 }),
    );
  });

  it("uses the fixed download script and returns structured status", async () => {
    const executor = new FakeExecutor();
    const runtime = new DataPlatformRuntime(
      new MemoryDataPlatformCatalog(),
      config,
      executor,
    );

    const statuses = await runtime.downloads();
    const queued = await runtime.createDownloadJob("watch-events", "start");
    const completed = await waitForTerminalJob(runtime, queued.jobId);

    expect(statuses).toHaveLength(2);
    expect(statuses[0].event).toBe("WatchEvent");
    expect(executor.requests[0]?.args).toEqual(["status", "--json"]);
    expect(executor.requests[1]?.args).toEqual([
      "status",
      "--json",
      "--skip-quota",
    ]);
    expect(completed.state).toBe("succeeded");
    expect(executor.requests.at(-1)?.executable).toBe(
      "/private/trainer/scripts/download-watch-events.sh",
    );
    expect(executor.requests.at(-1)?.args).toEqual(["start", "--json"]);
  });

  it("registers an existing Raw dataset without exposing its workspace", async () => {
    const executor = new FakeExecutor();
    const runtime = new DataPlatformRuntime(
      new MemoryDataPlatformCatalog(),
      config,
      executor,
    );

    const queued = await runtime.createCatalogRegistrationJob(
      "lake.register-existing-watch-events",
    );
    const completed = await waitForTerminalJob(runtime, queued.jobId);
    const datasets = await runtime.datasets();
    const partitions = await runtime.partitions({
      datasetId: "githubarchive_watch_event",
    });

    expect(completed.state).toBe("succeeded");
    expect(executor.requests.at(-1)?.args).toEqual([
      "lake",
      "inspect-watch-events",
      "--workspace",
      "/private/watch-workspace",
    ]);
    expect(datasets).toEqual([
      expect.objectContaining({
        datasetId: "githubarchive_watch_event",
        logicalUri: "lake://raw/bigquery/githubarchive_watch_event/schema=v1",
      }),
    ]);
    expect(partitions.total).toBe(1);
    expect(JSON.stringify(runtime.result(queued.jobId))).not.toContain(
      "/private/watch-workspace",
    );
  });

  it("rejects an internally inconsistent Trainer inventory", async () => {
    const runtime = new DataPlatformRuntime(
      new MemoryDataPlatformCatalog(),
      config,
      new InvalidInventoryExecutor(),
    );

    const queued = await runtime.createCatalogRegistrationJob(
      "lake.register-existing-watch-events",
    );
    const completed = await waitForTerminalJob(runtime, queued.jobId);

    expect(completed.state).toBe("failed");
    expect(completed.errorCode).toBe("INVALID_DATASET_INVENTORY");
    expect(await runtime.datasets()).toEqual([]);
  });

  it("marks unfinished jobs interrupted after a runtime restart", async () => {
    const catalog = new MemoryDataPlatformCatalog();
    const job = await catalog.createJob({
      jobId: "job-stale",
      actionId: "bigquery.sql-lab.query",
      inputHash: "sha256:input",
    });

    const runtime = new DataPlatformRuntime(
      catalog,
      config,
      new FakeExecutor(),
    );
    await runtime.initialize();

    expect((await runtime.job(job.jobId))?.state).toBe("interrupted");
  });

  it("clears transient result flags after a runtime restart", async () => {
    const catalog = new MemoryDataPlatformCatalog();
    const job = await catalog.createJob({
      jobId: "job-completed",
      actionId: "bigquery.sql-lab.query",
      inputHash: "sha256:input",
    });
    await catalog.updateJob(job.jobId, {
      state: "succeeded",
      stage: "succeeded",
      resultAvailable: true,
    });

    const runtime = new DataPlatformRuntime(
      catalog,
      config,
      new FakeExecutor(),
    );
    await runtime.initialize();

    expect((await runtime.job(job.jobId))?.state).toBe("succeeded");
    expect((await runtime.job(job.jobId))?.resultAvailable).toBe(false);
  });

  it("retries catalog initialization after PostgreSQL becomes available", async () => {
    const catalog = new FlakyCatalog();
    const runtime = new DataPlatformRuntime(
      catalog,
      config,
      new FakeExecutor(),
    );

    await expect(runtime.initialize()).rejects.toThrow("database unavailable");
    await expect(runtime.initialize()).resolves.toBeUndefined();
    expect(catalog.attempts).toBe(2);
  });
});

class FlakyCatalog extends MemoryDataPlatformCatalog {
  attempts = 0;

  override async initialize() {
    this.attempts += 1;
    if (this.attempts === 1) throw new Error("database unavailable");
  }
}

class FakeExecutor implements DataPlatformProcessExecutor {
  readonly requests: ProcessRequest[] = [];
  sqlFromFile?: string;

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    const sqlFileIndex = request.args.indexOf("--sql-file");
    if (sqlFileIndex >= 0) {
      this.sqlFromFile = await readFile(request.args[sqlFileIndex + 1], "utf8");
      return result({
        schema_version: 1,
        operation: "dry_run",
        sql_sha256:
          "sha256:e004ebd5b5532a4b85984a62f8ad48a81aa3460c1ca07701f386135d72cdecf5",
        estimated_bytes: 0,
      });
    }
    if (request.args[0] === "status") {
      return result({
        schema_version: 1,
        event: request.executable.includes("watch")
          ? "WatchEvent"
          : "PushEvent",
        command: "download-events",
        state: "running",
        screen_session: "test",
        worker_pid: 1,
        quota_monitor_pid: 2,
        start_date: "2016-01-01",
        end_date: "2026-08-25",
        total_partitions: 3890,
        completed_partitions: 1,
        last_partition: "20160101",
        estimated_total_bytes: 1,
        checkpoint_error: null,
        quota: null,
        quota_error: null,
      });
    }
    if (request.args[0] === "lake") return result(inventoryResult());
    return result({ schema_version: 1, ok: true, state: "running" });
  }
}

class InvalidInventoryExecutor extends FakeExecutor {
  override async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.args[0] !== "lake") return super.run(request);
    const inventory = inventoryResult();
    return result({
      ...inventory,
      dataset: { ...inventory.dataset, total_partitions: 2 },
    });
  }
}

function inventoryResult() {
  return {
    schema_version: 1,
    dataset: {
      dataset_id: "githubarchive_watch_event",
      schema_version: 1,
      display_name: "GH Archive WatchEvent",
      source: "bigquery",
      partition_key: "event_date",
      logical_uri: "lake://raw/bigquery/githubarchive_watch_event/schema=v1",
      state: "partial",
      start_date: "2016-01-01",
      end_date: "2026-08-25",
      ready_partitions: 1,
      failed_partitions: 0,
      missing_partitions: 0,
      total_partitions: 1,
      total_rows: 10,
      total_bytes: 100,
      estimated_total_bytes: 1_000,
      watermark: "2016-01-01",
      untracked_file_count: 0,
      observed_at: "2026-08-27T00:00:00+00:00",
    },
    partitions: [
      {
        partition_key: "event_date",
        partition_value: "2016-01-01",
        source_partition: "20160101",
        state: "ready",
        validation_state: "valid",
        logical_uri:
          "lake://raw/bigquery/githubarchive_watch_event/schema=v1/event_date=2016-01-01",
        checksum: "sha256:test",
        row_count: 10,
        file_size_bytes: 100,
        estimated_bytes: 1_000,
        error_code: null,
      },
    ],
    storage: {
      storage_id: "primary-data-volume",
      logical_uri: "storage://primary-data-volume",
      capacity_bytes: 1_000_000,
      used_bytes: 100,
      available_bytes: 999_900,
      dataset_bytes: 100,
      observed_at: "2026-08-27T00:00:00+00:00",
    },
  };
}

function result(body: Record<string, unknown>): ProcessResult {
  return { exitCode: 0, stdout: JSON.stringify(body), stderr: "" };
}

async function waitForTerminalJob(runtime: DataPlatformRuntime, jobId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = await runtime.job(jobId);
    if (job && ["succeeded", "failed", "cancelled"].includes(job.state)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job did not finish");
}
