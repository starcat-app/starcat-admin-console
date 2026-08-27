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

import { z } from "zod";

import type { DataPlatformCatalog } from "./catalog.js";
import {
  type DataPlatformProcessExecutor,
  LocalProcessExecutor,
  dataPlatformEnvironment,
} from "./process.js";
import type {
  CatalogActionId,
  DataPlatformPartitionQuery,
  DatasetInventory,
  DownloadActionId,
  DownloadEventId,
  DownloadStatus,
  SqlLabJobInput,
} from "./types.js";

const TRANSIENT_RESULT_TTL_MS = 10 * 60 * 1_000;
const DOWNLOAD_STATUS_TTL_MS = 30 * 1_000;
const MAXIMUM_PROCESS_OUTPUT_BYTES = 3 * (1 << 20);
const MAXIMUM_INVENTORY_OUTPUT_BYTES = 16 * (1 << 20);

const inventorySchema = z.object({
  schema_version: z.literal(1),
  dataset: z.object({
    dataset_id: z.string().min(1),
    schema_version: z.literal(1),
    display_name: z.string().min(1),
    source: z.string().min(1),
    partition_key: z.string().min(1),
    logical_uri: z.string().startsWith("lake://"),
    state: z.enum(["ready", "partial", "degraded"]),
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    ready_partitions: z.number().int().nonnegative(),
    failed_partitions: z.number().int().nonnegative(),
    missing_partitions: z.number().int().nonnegative(),
    total_partitions: z.number().int().positive(),
    total_rows: z.number().int().nonnegative(),
    total_bytes: z.number().int().nonnegative(),
    estimated_total_bytes: z.number().int().nonnegative(),
    watermark: z.iso.date().nullable(),
    untracked_file_count: z.number().int().nonnegative(),
    observed_at: z.iso.datetime({ offset: true }),
  }),
  partitions: z.array(
    z.object({
      partition_key: z.string().min(1),
      partition_value: z.iso.date(),
      source_partition: z.string().min(1),
      state: z.enum(["ready", "failed", "missing"]),
      validation_state: z.string().min(1),
      logical_uri: z.string().startsWith("lake://"),
      checksum: z.string().nullable(),
      row_count: z.number().int().nonnegative().nullable(),
      file_size_bytes: z.number().int().nonnegative().nullable(),
      estimated_bytes: z.number().int().nonnegative().nullable(),
      error_code: z.string().nullable(),
    }),
  ),
  storage: z.object({
    storage_id: z.string().min(1),
    logical_uri: z.string().startsWith("storage://"),
    capacity_bytes: z.number().int().positive(),
    used_bytes: z.number().int().nonnegative(),
    available_bytes: z.number().int().nonnegative(),
    dataset_bytes: z.number().int().nonnegative(),
    observed_at: z.iso.datetime({ offset: true }),
  }),
});

export interface DataPlatformRuntimeConfig {
  trainerRoot: string;
  watchWorkspace: string;
  pushWorkspace: string;
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
  private downloadSnapshot?: {
    expiresAt: number;
    statuses: DownloadStatus[];
  };
  private downloadRefresh?: Promise<DownloadStatus[]>;
  private initialized?: Promise<void>;

  constructor(
    private readonly catalog: DataPlatformCatalog,
    readonly config: DataPlatformRuntimeConfig,
    private readonly executor: DataPlatformProcessExecutor = new LocalProcessExecutor(),
  ) {}

  async initialize() {
    const pending = (this.initialized ??= (async () => {
      await this.catalog.initialize();
      await this.catalog.markStaleJobsInterrupted();
    })());
    try {
      await pending;
    } catch (error) {
      // PostgreSQL 可能比 BFF 晚启动；失败 Promise 不能永久毒化 Runtime，下一次请求应重试。
      if (this.initialized === pending) this.initialized = undefined;
      throw error;
    }
  }

  async downloads() {
    await this.initialize();
    if (this.downloadSnapshot && this.downloadSnapshot.expiresAt > Date.now()) {
      return this.downloadSnapshot.statuses;
    }
    this.downloadRefresh ??= this.fetchDownloadStatuses().finally(() => {
      this.downloadRefresh = undefined;
    });
    const statuses = await this.downloadRefresh;
    this.downloadSnapshot = {
      expiresAt: Date.now() + DOWNLOAD_STATUS_TTL_MS,
      statuses,
    };
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
        // 生命周期动作完成后立即失效快照，下一次读取应反映真实进程状态。
        this.downloadSnapshot = undefined;
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

  async createCatalogRegistrationJob(actionId: CatalogActionId) {
    await this.initialize();
    const target = catalogRegistrationTarget(this.config, actionId);
    const job = await this.catalog.createJob({
      jobId: createJobId(),
      actionId,
      inputHash: hashJSON({ actionId, datasetId: target.datasetId }),
    });
    this.enqueue({
      jobId: job.jobId,
      actionId,
      execute: async (signal) => {
        const raw = await this.runJSON(
          path.join(this.config.trainerRoot, ".venv/bin/starcat-recsys"),
          ["lake", target.command, "--workspace", target.workspace],
          10 * 60 * 1_000,
          signal,
          MAXIMUM_INVENTORY_OUTPUT_BYTES,
        );
        const inventory = inventoryFromTrainer(raw);
        if (inventory.dataset.datasetId !== target.datasetId) {
          throw new ActionError("UNEXPECTED_DATASET_ID");
        }
        await this.catalog.replaceDatasetInventory(inventory);
        // 任务结果只返回摘要，分区明细已经原子落入 Catalog，避免 BFF 长时间保留大对象。
        return {
          schema_version: 1,
          dataset_id: inventory.dataset.datasetId,
          schemaVersion: inventory.dataset.schemaVersion,
          state: inventory.dataset.state,
          ready_partitions: inventory.dataset.readyPartitions,
          failed_partitions: inventory.dataset.failedPartitions,
          missing_partitions: inventory.dataset.missingPartitions,
          registered_at: inventory.dataset.registeredAt,
        };
      },
    });
    return job;
  }

  async jobs(limit = 50) {
    await this.initialize();
    return this.catalog.listJobs(limit);
  }

  async datasets() {
    await this.initialize();
    return this.catalog.listDatasets();
  }

  async dataset(datasetId: string, schemaVersion = 1) {
    await this.initialize();
    return this.catalog.getDataset(datasetId, schemaVersion);
  }

  async partitions(query: DataPlatformPartitionQuery) {
    await this.initialize();
    return this.catalog.listPartitions(query);
  }

  async storage() {
    await this.initialize();
    return this.catalog.listStorageSnapshots();
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

  private async fetchDownloadStatuses(): Promise<DownloadStatus[]> {
    const [watch, push] = await Promise.all([
      this.downloadStatus("watch-events", true),
      this.downloadStatus("push-events", false),
    ]);
    // 两个任务共享同一 GCP Project 月度额度；只查询一次并复用，避免 UI 轮询放大
    // INFORMATION_SCHEMA 查询次数。
    return [
      watch,
      { ...push, quota: watch.quota, quota_error: watch.quota_error },
    ];
  }

  private async downloadStatus(
    event: DownloadEventId,
    includeQuota: boolean,
  ): Promise<DownloadStatus> {
    return (await this.runJSON(
      downloadScript(this.config.trainerRoot, event),
      ["status", "--json", ...(includeQuota ? [] : ["--skip-quota"])],
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
    maximumOutputBytes = MAXIMUM_PROCESS_OUTPUT_BYTES,
  ): Promise<Record<string, unknown>> {
    const result = await this.executor.run({
      executable,
      args,
      cwd: this.config.trainerRoot,
      environment: dataPlatformEnvironment(this.config.billingProject),
      timeoutMs,
      maximumOutputBytes,
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
  const watchWorkspace = path.resolve(
    process.env.STARCAT_WATCH_WORKSPACE?.trim() ||
      "/Volumes/T0/Starcat/bigquery/watch-events-2016-2026",
  );
  const pushWorkspace = path.resolve(
    process.env.STARCAT_PUSH_WORKSPACE?.trim() ||
      "/Volumes/T0/Starcat/bigquery/push-events-2016-2026",
  );
  if (!/^[A-Za-z0-9-]+$/.test(billingProject)) {
    throw new Error("STARCAT_BQ_BILLING_PROJECT 未配置或格式不合法");
  }
  if (!/^[A-Za-z0-9-]+$/.test(location)) {
    throw new Error("STARCAT_BQ_LOCATION 格式不合法");
  }
  return {
    trainerRoot,
    watchWorkspace,
    pushWorkspace,
    billingProject,
    location,
  };
}

function catalogRegistrationTarget(
  config: DataPlatformRuntimeConfig,
  actionId: CatalogActionId,
) {
  return actionId === "lake.register-existing-watch-events"
    ? {
        command: "inspect-watch-events",
        workspace: config.watchWorkspace,
        datasetId: "githubarchive_watch_event",
      }
    : {
        command: "inspect-push-events",
        workspace: config.pushWorkspace,
        datasetId: "githubarchive_push_event",
      };
}

function inventoryFromTrainer(raw: Record<string, unknown>): DatasetInventory {
  let parsed: z.infer<typeof inventorySchema>;
  try {
    parsed = inventorySchema.parse(raw);
  } catch {
    throw new ActionError("INVALID_DATASET_INVENTORY");
  }
  assertInventoryConsistency(parsed);
  const registeredAt = new Date().toISOString();
  const dataset = parsed.dataset;
  return {
    dataset: {
      datasetId: dataset.dataset_id,
      schemaVersion: dataset.schema_version,
      displayName: dataset.display_name,
      source: dataset.source,
      partitionKey: dataset.partition_key,
      logicalUri: dataset.logical_uri,
      state: dataset.state,
      startDate: dataset.start_date,
      endDate: dataset.end_date,
      readyPartitions: dataset.ready_partitions,
      failedPartitions: dataset.failed_partitions,
      missingPartitions: dataset.missing_partitions,
      totalPartitions: dataset.total_partitions,
      totalRows: dataset.total_rows,
      totalBytes: dataset.total_bytes,
      estimatedTotalBytes: dataset.estimated_total_bytes,
      watermark: dataset.watermark ?? undefined,
      untrackedFileCount: dataset.untracked_file_count,
      observedAt: dataset.observed_at,
      registeredAt,
    },
    partitions: parsed.partitions.map((partition) => ({
      datasetId: dataset.dataset_id,
      schemaVersion: dataset.schema_version,
      partitionKey: partition.partition_key,
      partitionValue: partition.partition_value,
      sourcePartition: partition.source_partition,
      state: partition.state,
      validationState: partition.validation_state,
      logicalUri: partition.logical_uri,
      checksum: partition.checksum ?? undefined,
      rowCount: partition.row_count ?? undefined,
      fileSizeBytes: partition.file_size_bytes ?? undefined,
      estimatedBytes: partition.estimated_bytes ?? undefined,
      errorCode: partition.error_code ?? undefined,
      observedAt: dataset.observed_at,
    })),
    storage: {
      storageId: parsed.storage.storage_id,
      logicalUri: parsed.storage.logical_uri,
      capacityBytes: parsed.storage.capacity_bytes,
      usedBytes: parsed.storage.used_bytes,
      availableBytes: parsed.storage.available_bytes,
      observedAt: parsed.storage.observed_at,
    },
  };
}

function assertInventoryConsistency(parsed: z.infer<typeof inventorySchema>) {
  const { dataset, partitions, storage } = parsed;
  const states = { ready: 0, failed: 0, missing: 0 };
  const partitionValues = new Set<string>();
  let totalRows = 0;
  let totalBytes = 0;
  let estimatedTotalBytes = 0;
  for (const partition of partitions) {
    states[partition.state] += 1;
    totalRows += partition.row_count ?? 0;
    totalBytes += partition.file_size_bytes ?? 0;
    estimatedTotalBytes += partition.estimated_bytes ?? 0;
    const logicalPrefix = `${dataset.logical_uri}/${dataset.partition_key}=`;
    if (
      partition.partition_key !== dataset.partition_key ||
      partition.partition_value < dataset.start_date ||
      partition.partition_value > dataset.end_date ||
      !partition.logical_uri.startsWith(logicalPrefix) ||
      partitionValues.has(partition.partition_value)
    ) {
      throw new ActionError("INVALID_DATASET_INVENTORY");
    }
    partitionValues.add(partition.partition_value);
  }
  if (
    partitions.length !== dataset.total_partitions ||
    states.ready !== dataset.ready_partitions ||
    states.failed !== dataset.failed_partitions ||
    states.missing !== dataset.missing_partitions ||
    totalRows !== dataset.total_rows ||
    totalBytes !== dataset.total_bytes ||
    estimatedTotalBytes !== dataset.estimated_total_bytes ||
    storage.dataset_bytes !== dataset.total_bytes
  ) {
    throw new ActionError("INVALID_DATASET_INVENTORY");
  }
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
