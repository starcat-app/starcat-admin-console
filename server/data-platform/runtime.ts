/**
 * 本机数据平台 Action Registry 与串行 JobRunner。
 *
 * SQL 只在内存和 0600 临时文件中存在；Catalog 永远只记录 hash 和计费摘要。
 * 下载任务继续由 Trainer 脚本管理 screen/checkpoint，控制台只调用固定动作。
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { DataPlatformCatalog } from "./catalog.js";
import {
  type DataPlatformProcessExecutor,
  LocalProcessExecutor,
  dataPlatformEnvironment,
} from "./process.js";
import type {
  DownloadActionId,
  DownloadEventId,
  DownloadStatus,
  SqlLabJobInput,
} from "./types.js";

const TRANSIENT_RESULT_TTL_MS = 10 * 60 * 1_000;
const MAXIMUM_PROCESS_OUTPUT_BYTES = 3 * (1 << 20);

export interface DataPlatformRuntimeConfig {
  trainerRoot: string;
  billingProject: string;
  location: string;
}

interface PendingJob {
  jobId: string;
  actionId: string;
  execute: (signal: AbortSignal) => Promise<Record<string, unknown>>;
}

export class DataPlatformRuntime {
  private queue = Promise.resolve();
  private readonly activeJobs = new Map<string, AbortController>();
  private readonly transientResults = new Map<
    string,
    Record<string, unknown>
  >();
  private initialized?: Promise<void>;

  constructor(
    private readonly catalog: DataPlatformCatalog,
    readonly config: DataPlatformRuntimeConfig,
    private readonly executor: DataPlatformProcessExecutor = new LocalProcessExecutor(),
  ) {}

  async initialize() {
    this.initialized ??= (async () => {
      await this.catalog.initialize();
      await this.catalog.markStaleJobsInterrupted();
    })();
    await this.initialized;
  }

  async downloads() {
    await this.initialize();
    const statuses = await Promise.all([
      this.downloadStatus("watch-events"),
      this.downloadStatus("push-events"),
    ]);
    return statuses;
  }

  async createDownloadJob(event: DownloadEventId, action: DownloadActionId) {
    await this.initialize();
    const actionId = `bigquery.${event}.${action}`;
    const job = await this.catalog.createJob({
      jobId: createJobId(),
      actionId,
      inputHash: hashJSON({ event, action }),
    });
    this.enqueue({
      jobId: job.jobId,
      actionId,
      execute: async (signal) => {
        const result = await this.runJSON(
          downloadScript(this.config.trainerRoot, event),
          [action, "--json"],
          30_000,
          signal,
        );
        if (result.ok !== true) throw new ActionError("DOWNLOAD_ACTION_FAILED");
        return result;
      },
    });
    return job;
  }

  async createSqlLabJob(operation: "dry-run" | "query", input: SqlLabJobInput) {
    await this.initialize();
    const normalizedSQL = normalizeSQL(input.sql);
    const sqlHash = hashText(normalizedSQL);
    const actionId = `bigquery.sql-lab.${operation}`;
    const job = await this.catalog.createJob({
      jobId: createJobId(),
      actionId,
      inputHash: hashJSON({
        sqlHash,
        maximumBytesBilled: input.maximumBytesBilled,
        expectedSqlSha256: input.expectedSqlSha256,
        maximumResultRows: input.maximumResultRows,
      }),
      sqlHash,
    });
    this.enqueue({
      jobId: job.jobId,
      actionId,
      execute: (signal) =>
        this.runSqlLab(operation, { ...input, sql: normalizedSQL }, signal),
    });
    return job;
  }

  async jobs(limit = 50) {
    await this.initialize();
    return this.catalog.listJobs(limit);
  }

  async job(jobId: string) {
    await this.initialize();
    return this.catalog.getJob(jobId);
  }

  result(jobId: string) {
    return this.transientResults.get(jobId);
  }

  async cancel(jobId: string) {
    await this.initialize();
    const job = await this.catalog.getJob(jobId);
    if (!job) return undefined;
    if (!["queued", "running"].includes(job.state)) return job;
    const updated = await this.catalog.updateJob(jobId, {
      state: "cancel_requested",
      stage: "cancel_requested",
    });
    this.activeJobs.get(jobId)?.abort();
    return updated;
  }

  publicConfig() {
    return {
      billingProject: this.config.billingProject,
      location: this.config.location,
      maximumBytesBilled: 10 * (1 << 30),
      maximumResultRows: 200,
      maximumResultBytes: 2 * (1 << 20),
    };
  }

  private async downloadStatus(
    event: DownloadEventId,
  ): Promise<DownloadStatus> {
    return (await this.runJSON(
      downloadScript(this.config.trainerRoot, event),
      ["status", "--json"],
      45_000,
    )) as unknown as DownloadStatus;
  }

  private enqueue(pending: PendingJob) {
    const run = () => this.runPending(pending);
    this.queue = this.queue.then(run, run).then(
      () => undefined,
      () => undefined,
    );
  }

  private async runPending(pending: PendingJob) {
    const current = await this.catalog.getJob(pending.jobId);
    if (!current || current.state === "cancel_requested") {
      if (current) {
        await this.catalog.updateJob(current.jobId, {
          state: "cancelled",
          stage: "cancelled",
          finishedAt: new Date().toISOString(),
        });
      }
      return;
    }
    const controller = new AbortController();
    this.activeJobs.set(pending.jobId, controller);
    await this.catalog.updateJob(pending.jobId, {
      state: "running",
      stage: "executing",
      startedAt: new Date().toISOString(),
    });
    try {
      const result = await pending.execute(controller.signal);
      this.transientResults.set(pending.jobId, result);
      const cleanup = setTimeout(
        () => this.transientResults.delete(pending.jobId),
        TRANSIENT_RESULT_TTL_MS,
      );
      cleanup.unref();
      await this.catalog.updateJob(pending.jobId, {
        state: "succeeded",
        stage: "succeeded",
        sqlHash: optionalString(result.sql_sha256),
        bigQueryJobId: optionalString(result.job_id),
        estimatedBytes: optionalNumber(result.estimated_bytes),
        processedBytes: optionalNumber(result.processed_bytes),
        billedBytes: optionalNumber(result.billed_bytes),
        resultAvailable: true,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      await this.catalog.updateJob(pending.jobId, {
        state: cancelled ? "cancelled" : "failed",
        stage: cancelled ? "cancelled" : "failed",
        errorCode: cancelled ? "JOB_CANCELLED" : errorCode(error),
        errorSummary: cancelled
          ? "任务已取消"
          : "操作失败，请查看本机 BFF 终端日志",
        finishedAt: new Date().toISOString(),
      });
      if (!cancelled) {
        console.error("Data platform action failed", {
          actionId: pending.actionId,
          errorCode: errorCode(error),
        });
      }
    } finally {
      this.activeJobs.delete(pending.jobId);
    }
  }

  private async runSqlLab(
    operation: "dry-run" | "query",
    input: SqlLabJobInput,
    signal: AbortSignal,
  ) {
    const directory = path.join(tmpdir(), `starcat-sql-lab-${randomUUID()}`);
    const sqlFile = path.join(directory, "query.sql");
    await mkdir(directory, { mode: 0o700 });
    await writeFile(sqlFile, input.sql, { encoding: "utf8", mode: 0o600 });
    try {
      const args = [
        "bigquery",
        operation === "dry-run" ? "sql-lab-dry-run" : "sql-lab-query",
        "--sql-file",
        sqlFile,
        "--billing-project",
        this.config.billingProject,
        "--location",
        this.config.location,
        "--maximum-bytes-billed",
        String(input.maximumBytesBilled),
      ];
      if (operation === "query") {
        args.push(
          "--expected-sql-sha256",
          input.expectedSqlSha256 ?? "",
          "--maximum-result-rows",
          String(input.maximumResultRows ?? 200),
        );
      }
      return await this.runJSON(
        path.join(this.config.trainerRoot, ".venv/bin/starcat-recsys"),
        args,
        120_000,
        signal,
      );
    } finally {
      // 目录由本次 Job 独占；无论查询成功、失败或取消都不能留下 SQL 明文。
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async runJSON(
    executable: string,
    args: string[],
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const result = await this.executor.run({
      executable,
      args,
      cwd: this.config.trainerRoot,
      environment: dataPlatformEnvironment(this.config.billingProject),
      timeoutMs,
      maximumOutputBytes: MAXIMUM_PROCESS_OUTPUT_BYTES,
      signal,
    });
    if (result.exitCode !== 0) {
      throw new ActionError(`PROCESS_EXIT_${result.exitCode}`);
    }
    try {
      const parsed: unknown = JSON.parse(result.stdout);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON result is not an object");
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new ActionError("INVALID_PROCESS_JSON");
    }
  }
}

class ActionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function dataPlatformConfigFromEnvironment(): DataPlatformRuntimeConfig {
  const trainerRoot = path.resolve(
    process.env.STARCAT_TRAINER_ROOT?.trim() ||
      path.join(process.cwd(), "../starcat-recsys-trainer"),
  );
  const billingProject = process.env.STARCAT_BQ_BILLING_PROJECT?.trim() ?? "";
  const location = process.env.STARCAT_BQ_LOCATION?.trim() || "US";
  if (!/^[A-Za-z0-9-]+$/.test(billingProject)) {
    throw new Error("STARCAT_BQ_BILLING_PROJECT 未配置或格式不合法");
  }
  if (!/^[A-Za-z0-9-]+$/.test(location)) {
    throw new Error("STARCAT_BQ_LOCATION 格式不合法");
  }
  return { trainerRoot, billingProject, location };
}

function downloadScript(root: string, event: DownloadEventId) {
  return path.join(
    root,
    "scripts",
    event === "watch-events"
      ? "download-watch-events.sh"
      : "download-push-events.sh",
  );
}

function createJobId() {
  return `job_${randomUUID()}`;
}

function normalizeSQL(sql: string) {
  const normalized = sql.trim();
  return normalized.endsWith(";")
    ? normalized.slice(0, -1).trimEnd()
    : normalized;
}

function hashText(value: string) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashJSON(value: unknown) {
  return hashText(JSON.stringify(value));
}

function errorCode(error: unknown) {
  return error instanceof ActionError
    ? error.code
    : "DATA_PLATFORM_ACTION_FAILED";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
