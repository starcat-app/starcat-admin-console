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
});

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
    return result({ schema_version: 1, ok: true, state: "running" });
  }
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
