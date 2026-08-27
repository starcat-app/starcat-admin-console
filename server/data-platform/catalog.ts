/**
 * 数据平台 PostgreSQL Catalog。
 *
 * Catalog 保存任务控制元数据、数据集清单和发布控制元数据，不保存 SQL 文本或 Raw 数据。
 * 测试使用同一接口的内存实现，生产路径没有 SQLite 或文件回退，避免出现双真源。
 */
import postgres, { type Sql } from "postgres";

import type {
  DataPlatformDataset,
  DataPlatformJob,
  DataPlatformPartition,
  DataPlatformPartitionPage,
  DataPlatformPartitionQuery,
  DataPlatformStorageSnapshot,
  DatasetInventory,
  JobUpdate,
} from "./types.js";

export interface CreateJobInput {
  jobId: string;
  actionId: string;
  inputHash: string;
  sqlHash?: string;
}

export interface DataPlatformCatalog {
  initialize(): Promise<void>;
  createJob(input: CreateJobInput): Promise<DataPlatformJob>;
  updateJob(jobId: string, update: JobUpdate): Promise<DataPlatformJob>;
  getJob(jobId: string): Promise<DataPlatformJob | undefined>;
  listJobs(limit?: number): Promise<DataPlatformJob[]>;
  replaceDatasetInventory(inventory: DatasetInventory): Promise<void>;
  listDatasets(): Promise<DataPlatformDataset[]>;
  getDataset(
    datasetId: string,
    schemaVersion?: number,
  ): Promise<DataPlatformDataset | undefined>;
  listPartitions(
    query: DataPlatformPartitionQuery,
  ): Promise<DataPlatformPartitionPage>;
  listStorageSnapshots(): Promise<DataPlatformStorageSnapshot[]>;
  markStaleJobsInterrupted(): Promise<void>;
  close(): Promise<void>;
}

export class PostgresDataPlatformCatalog implements DataPlatformCatalog {
  private readonly sql: Sql;

  constructor(databaseURL: string) {
    this.sql = postgres(databaseURL, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }

  async initialize() {
    await this.sql.begin(async (transaction) => {
      // 多个 BFF 同时启动时只允许一个进程执行迁移，避免 DDL 相互抢锁。
      await transaction`SELECT pg_advisory_xact_lock(2026082701)`;
      await transaction`
        CREATE TABLE IF NOT EXISTS data_platform_schema_migrations (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS data_platform_jobs (
          job_id TEXT PRIMARY KEY,
          action_id TEXT NOT NULL,
          state TEXT NOT NULL,
          stage TEXT NOT NULL,
          input_hash TEXT NOT NULL,
          sql_hash TEXT,
          bigquery_job_id TEXT,
          estimated_bytes BIGINT,
          processed_bytes BIGINT,
          billed_bytes BIGINT,
          error_code TEXT,
          error_summary TEXT,
          result_available BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL,
          started_at TIMESTAMPTZ,
          finished_at TIMESTAMPTZ
        )
      `;
      await transaction`
        CREATE INDEX IF NOT EXISTS data_platform_jobs_created_at_idx
        ON data_platform_jobs (created_at DESC)
      `;
      await transaction`
        INSERT INTO data_platform_schema_migrations (version, description)
        VALUES (1, '任务 Catalog')
        ON CONFLICT (version) DO NOTHING
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS data_platform_datasets (
          dataset_id TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          display_name TEXT NOT NULL,
          source TEXT NOT NULL,
          partition_key TEXT NOT NULL,
          logical_uri TEXT NOT NULL,
          state TEXT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          ready_partitions INTEGER NOT NULL,
          failed_partitions INTEGER NOT NULL,
          missing_partitions INTEGER NOT NULL,
          total_partitions INTEGER NOT NULL,
          total_rows BIGINT NOT NULL,
          total_bytes BIGINT NOT NULL,
          estimated_total_bytes BIGINT NOT NULL,
          untracked_file_count INTEGER NOT NULL,
          observed_at TIMESTAMPTZ NOT NULL,
          registered_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (dataset_id, schema_version)
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS data_platform_partitions (
          dataset_id TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          partition_key TEXT NOT NULL,
          partition_value DATE NOT NULL,
          source_partition TEXT NOT NULL,
          state TEXT NOT NULL,
          validation_state TEXT NOT NULL,
          logical_uri TEXT NOT NULL,
          checksum TEXT,
          row_count BIGINT,
          file_size_bytes BIGINT,
          estimated_bytes BIGINT,
          error_code TEXT,
          observed_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (dataset_id, schema_version, partition_key, partition_value),
          FOREIGN KEY (dataset_id, schema_version)
            REFERENCES data_platform_datasets (dataset_id, schema_version)
            ON DELETE CASCADE
        )
      `;
      await transaction`
        CREATE INDEX IF NOT EXISTS data_platform_partitions_lookup_idx
        ON data_platform_partitions (
          dataset_id, schema_version, state, partition_value DESC
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS data_platform_watermarks (
          dataset_id TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          watermark_type TEXT NOT NULL,
          partition_value DATE,
          observed_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (dataset_id, schema_version, watermark_type),
          FOREIGN KEY (dataset_id, schema_version)
            REFERENCES data_platform_datasets (dataset_id, schema_version)
            ON DELETE CASCADE
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS data_platform_storage_snapshots (
          storage_id TEXT PRIMARY KEY,
          logical_uri TEXT NOT NULL,
          capacity_bytes BIGINT NOT NULL,
          used_bytes BIGINT NOT NULL,
          available_bytes BIGINT NOT NULL,
          observed_at TIMESTAMPTZ NOT NULL
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS data_platform_artifacts (
          artifact_id TEXT PRIMARY KEY,
          artifact_type TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          logical_uri TEXT NOT NULL,
          checksum TEXT NOT NULL,
          state TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS data_platform_deployments (
          deployment_id TEXT PRIMARY KEY,
          service_id TEXT NOT NULL,
          artifact_id TEXT NOT NULL REFERENCES data_platform_artifacts (artifact_id),
          state TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          activated_at TIMESTAMPTZ
        )
      `;
      await transaction`
        INSERT INTO data_platform_schema_migrations (version, description)
        VALUES (2, 'Dataset Partition Storage 与发布 Catalog')
        ON CONFLICT (version) DO NOTHING
      `;
    });
  }

  async createJob(input: CreateJobInput) {
    const now = new Date().toISOString();
    const [row] = await this.sql`
      INSERT INTO data_platform_jobs (
        job_id, action_id, state, stage, input_hash, sql_hash, created_at
      ) VALUES (
        ${input.jobId}, ${input.actionId}, 'queued', 'queued',
        ${input.inputHash}, ${input.sqlHash ?? null}, ${now}
      )
      RETURNING *
    `;
    return jobFromRow(row);
  }

  async updateJob(jobId: string, update: JobUpdate) {
    const current = await this.getJob(jobId);
    if (!current) throw new Error("data platform job not found");
    const next = { ...current, ...update };
    const [row] = await this.sql`
      UPDATE data_platform_jobs SET
        state = ${next.state},
        stage = ${next.stage},
        sql_hash = ${next.sqlHash ?? null},
        bigquery_job_id = ${next.bigQueryJobId ?? null},
        estimated_bytes = ${next.estimatedBytes ?? null},
        processed_bytes = ${next.processedBytes ?? null},
        billed_bytes = ${next.billedBytes ?? null},
        error_code = ${next.errorCode ?? null},
        error_summary = ${next.errorSummary ?? null},
        result_available = ${next.resultAvailable},
        started_at = ${next.startedAt ?? null},
        finished_at = ${next.finishedAt ?? null}
      WHERE job_id = ${jobId}
      RETURNING *
    `;
    return jobFromRow(row);
  }

  async getJob(jobId: string) {
    const [row] = await this.sql`
      SELECT * FROM data_platform_jobs WHERE job_id = ${jobId}
    `;
    return row ? jobFromRow(row) : undefined;
  }

  async listJobs(limit = 50) {
    const rows = await this.sql`
      SELECT * FROM data_platform_jobs
      ORDER BY created_at DESC
      LIMIT ${Math.min(Math.max(limit, 1), 200)}
    `;
    return rows.map(jobFromRow);
  }

  async replaceDatasetInventory(inventory: DatasetInventory) {
    const dataset = inventory.dataset;
    await this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO data_platform_datasets (
          dataset_id, schema_version, display_name, source, partition_key,
          logical_uri, state, start_date, end_date, ready_partitions,
          failed_partitions, missing_partitions, total_partitions, total_rows,
          total_bytes, estimated_total_bytes, untracked_file_count,
          observed_at, registered_at
        ) VALUES (
          ${dataset.datasetId}, ${dataset.schemaVersion}, ${dataset.displayName},
          ${dataset.source}, ${dataset.partitionKey}, ${dataset.logicalUri},
          ${dataset.state}, ${dataset.startDate}, ${dataset.endDate},
          ${dataset.readyPartitions}, ${dataset.failedPartitions},
          ${dataset.missingPartitions}, ${dataset.totalPartitions},
          ${dataset.totalRows}, ${dataset.totalBytes},
          ${dataset.estimatedTotalBytes}, ${dataset.untrackedFileCount},
          ${dataset.observedAt}, ${dataset.registeredAt}
        )
        ON CONFLICT (dataset_id, schema_version) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          source = EXCLUDED.source,
          partition_key = EXCLUDED.partition_key,
          logical_uri = EXCLUDED.logical_uri,
          state = EXCLUDED.state,
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          ready_partitions = EXCLUDED.ready_partitions,
          failed_partitions = EXCLUDED.failed_partitions,
          missing_partitions = EXCLUDED.missing_partitions,
          total_partitions = EXCLUDED.total_partitions,
          total_rows = EXCLUDED.total_rows,
          total_bytes = EXCLUDED.total_bytes,
          estimated_total_bytes = EXCLUDED.estimated_total_bytes,
          untracked_file_count = EXCLUDED.untracked_file_count,
          observed_at = EXCLUDED.observed_at,
          registered_at = EXCLUDED.registered_at
      `;
      // 一次检查得到的是同一时点的完整快照，先删后写可避免旧 missing/failed 行残留。
      await transaction`
        DELETE FROM data_platform_partitions
        WHERE dataset_id = ${dataset.datasetId}
          AND schema_version = ${dataset.schemaVersion}
      `;
      if (inventory.partitions.length > 0) {
        const rows = inventory.partitions.map((partition) => ({
          dataset_id: partition.datasetId,
          schema_version: partition.schemaVersion,
          partition_key: partition.partitionKey,
          partition_value: partition.partitionValue,
          source_partition: partition.sourcePartition,
          state: partition.state,
          validation_state: partition.validationState,
          logical_uri: partition.logicalUri,
          checksum: partition.checksum ?? null,
          row_count: partition.rowCount ?? null,
          file_size_bytes: partition.fileSizeBytes ?? null,
          estimated_bytes: partition.estimatedBytes ?? null,
          error_code: partition.errorCode ?? null,
          observed_at: partition.observedAt,
        }));
        await transaction`
          INSERT INTO data_platform_partitions ${transaction(
            rows,
            "dataset_id",
            "schema_version",
            "partition_key",
            "partition_value",
            "source_partition",
            "state",
            "validation_state",
            "logical_uri",
            "checksum",
            "row_count",
            "file_size_bytes",
            "estimated_bytes",
            "error_code",
            "observed_at",
          )}
        `;
      }
      await transaction`
        INSERT INTO data_platform_watermarks (
          dataset_id, schema_version, watermark_type, partition_value, observed_at
        ) VALUES (
          ${dataset.datasetId}, ${dataset.schemaVersion}, 'contiguous_ready',
          ${dataset.watermark ?? null}, ${dataset.observedAt}
        )
        ON CONFLICT (dataset_id, schema_version, watermark_type) DO UPDATE SET
          partition_value = EXCLUDED.partition_value,
          observed_at = EXCLUDED.observed_at
      `;
      const storage = inventory.storage;
      await transaction`
        INSERT INTO data_platform_storage_snapshots (
          storage_id, logical_uri, capacity_bytes, used_bytes,
          available_bytes, observed_at
        ) VALUES (
          ${storage.storageId}, ${storage.logicalUri}, ${storage.capacityBytes},
          ${storage.usedBytes}, ${storage.availableBytes}, ${storage.observedAt}
        )
        ON CONFLICT (storage_id) DO UPDATE SET
          logical_uri = EXCLUDED.logical_uri,
          capacity_bytes = EXCLUDED.capacity_bytes,
          used_bytes = EXCLUDED.used_bytes,
          available_bytes = EXCLUDED.available_bytes,
          observed_at = EXCLUDED.observed_at
      `;
    });
  }

  async listDatasets() {
    const rows = await this.sql`
      SELECT datasets.*, watermarks.partition_value AS watermark
      FROM data_platform_datasets AS datasets
      LEFT JOIN data_platform_watermarks AS watermarks
        ON watermarks.dataset_id = datasets.dataset_id
       AND watermarks.schema_version = datasets.schema_version
       AND watermarks.watermark_type = 'contiguous_ready'
      ORDER BY datasets.dataset_id, datasets.schema_version DESC
    `;
    return rows.map(datasetFromRow);
  }

  async getDataset(datasetId: string, schemaVersion = 1) {
    const [row] = await this.sql`
      SELECT datasets.*, watermarks.partition_value AS watermark
      FROM data_platform_datasets AS datasets
      LEFT JOIN data_platform_watermarks AS watermarks
        ON watermarks.dataset_id = datasets.dataset_id
       AND watermarks.schema_version = datasets.schema_version
       AND watermarks.watermark_type = 'contiguous_ready'
      WHERE datasets.dataset_id = ${datasetId}
        AND datasets.schema_version = ${schemaVersion}
    `;
    return row ? datasetFromRow(row) : undefined;
  }

  async listPartitions(
    query: DataPlatformPartitionQuery,
  ): Promise<DataPlatformPartitionPage> {
    const schemaVersion = query.schemaVersion ?? 1;
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const offset = Math.max(query.offset ?? 0, 0);
    const state = query.state ?? null;
    const dateFrom = query.dateFrom ?? null;
    const dateTo = query.dateTo ?? null;
    const [countRows, rows] = await Promise.all([
      this.sql`
        SELECT COUNT(*)::INTEGER AS total
        FROM data_platform_partitions
        WHERE dataset_id = ${query.datasetId}
          AND schema_version = ${schemaVersion}
          AND (${state}::TEXT IS NULL OR state = ${state})
          AND (${dateFrom}::DATE IS NULL OR partition_value >= ${dateFrom})
          AND (${dateTo}::DATE IS NULL OR partition_value <= ${dateTo})
      `,
      this.sql`
        SELECT * FROM data_platform_partitions
        WHERE dataset_id = ${query.datasetId}
          AND schema_version = ${schemaVersion}
          AND (${state}::TEXT IS NULL OR state = ${state})
          AND (${dateFrom}::DATE IS NULL OR partition_value >= ${dateFrom})
          AND (${dateTo}::DATE IS NULL OR partition_value <= ${dateTo})
        ORDER BY partition_value DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ]);
    return {
      items: rows.map(partitionFromRow),
      total: Number(countRows[0]?.total ?? 0),
      limit,
      offset,
    };
  }

  async listStorageSnapshots() {
    const rows = await this.sql`
      SELECT * FROM data_platform_storage_snapshots ORDER BY storage_id
    `;
    return rows.map(storageFromRow);
  }

  async markStaleJobsInterrupted() {
    // 查询结果只存在于 BFF 内存；进程重启后所有历史结果都已失效。
    await this.sql`
      UPDATE data_platform_jobs SET result_available = FALSE
      WHERE result_available = TRUE
    `;
    await this.sql`
      UPDATE data_platform_jobs SET
        state = 'interrupted',
        stage = 'interrupted',
        error_code = 'BFF_RESTARTED',
        error_summary = '本机控制台重启，未持久化的执行上下文已失效',
        result_available = FALSE,
        finished_at = NOW()
      WHERE state IN ('queued', 'running', 'cancel_requested')
    `;
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}

export class MemoryDataPlatformCatalog implements DataPlatformCatalog {
  private readonly jobs = new Map<string, DataPlatformJob>();
  private readonly datasets = new Map<string, DataPlatformDataset>();
  private readonly partitions = new Map<string, DataPlatformPartition[]>();
  private readonly storage = new Map<string, DataPlatformStorageSnapshot>();

  async initialize() {}

  async createJob(input: CreateJobInput) {
    const job: DataPlatformJob = {
      jobId: input.jobId,
      actionId: input.actionId,
      state: "queued",
      stage: "queued",
      inputHash: input.inputHash,
      sqlHash: input.sqlHash,
      createdAt: new Date().toISOString(),
      resultAvailable: false,
    };
    this.jobs.set(job.jobId, job);
    return structuredClone(job);
  }

  async updateJob(jobId: string, update: JobUpdate) {
    const current = this.jobs.get(jobId);
    if (!current) throw new Error("data platform job not found");
    const next = { ...current, ...update };
    this.jobs.set(jobId, next);
    return structuredClone(next);
  }

  async getJob(jobId: string) {
    const job = this.jobs.get(jobId);
    return job ? structuredClone(job) : undefined;
  }

  async listJobs(limit = 50) {
    return [...this.jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((job) => structuredClone(job));
  }

  async replaceDatasetInventory(inventory: DatasetInventory) {
    const key = datasetKey(
      inventory.dataset.datasetId,
      inventory.dataset.schemaVersion,
    );
    this.datasets.set(key, structuredClone(inventory.dataset));
    this.partitions.set(key, structuredClone(inventory.partitions));
    this.storage.set(
      inventory.storage.storageId,
      structuredClone(inventory.storage),
    );
  }

  async listDatasets() {
    return [...this.datasets.values()]
      .sort(
        (left, right) =>
          left.datasetId.localeCompare(right.datasetId) ||
          right.schemaVersion - left.schemaVersion,
      )
      .map((dataset) => structuredClone(dataset));
  }

  async getDataset(datasetId: string, schemaVersion = 1) {
    const dataset = this.datasets.get(datasetKey(datasetId, schemaVersion));
    return dataset ? structuredClone(dataset) : undefined;
  }

  async listPartitions(
    query: DataPlatformPartitionQuery,
  ): Promise<DataPlatformPartitionPage> {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const offset = Math.max(query.offset ?? 0, 0);
    const items = (
      this.partitions.get(
        datasetKey(query.datasetId, query.schemaVersion ?? 1),
      ) ?? []
    )
      .filter(
        (partition) =>
          (!query.state || partition.state === query.state) &&
          (!query.dateFrom || partition.partitionValue >= query.dateFrom) &&
          (!query.dateTo || partition.partitionValue <= query.dateTo),
      )
      .sort((left, right) =>
        right.partitionValue.localeCompare(left.partitionValue),
      );
    return {
      items: structuredClone(items.slice(offset, offset + limit)),
      total: items.length,
      limit,
      offset,
    };
  }

  async listStorageSnapshots() {
    return [...this.storage.values()]
      .sort((left, right) => left.storageId.localeCompare(right.storageId))
      .map((snapshot) => structuredClone(snapshot));
  }

  async markStaleJobsInterrupted() {
    for (const [jobId, job] of this.jobs) {
      const resultAvailable = false;
      if (["queued", "running", "cancel_requested"].includes(job.state)) {
        this.jobs.set(jobId, {
          ...job,
          resultAvailable,
          state: "interrupted",
          stage: "interrupted",
          errorCode: "BFF_RESTARTED",
          finishedAt: new Date().toISOString(),
        });
      } else this.jobs.set(jobId, { ...job, resultAvailable });
    }
  }

  async close() {}
}

function jobFromRow(row: postgres.Row): DataPlatformJob {
  return {
    jobId: String(row.job_id),
    actionId: String(row.action_id),
    state: row.state as DataPlatformJob["state"],
    stage: String(row.stage),
    inputHash: String(row.input_hash),
    sqlHash: optionalString(row.sql_hash),
    bigQueryJobId: optionalString(row.bigquery_job_id),
    estimatedBytes: optionalNumber(row.estimated_bytes),
    processedBytes: optionalNumber(row.processed_bytes),
    billedBytes: optionalNumber(row.billed_bytes),
    errorCode: optionalString(row.error_code),
    errorSummary: optionalString(row.error_summary),
    createdAt: isoDate(row.created_at),
    startedAt: optionalDate(row.started_at),
    finishedAt: optionalDate(row.finished_at),
    resultAvailable: Boolean(row.result_available),
  };
}

function datasetFromRow(row: postgres.Row): DataPlatformDataset {
  return {
    datasetId: String(row.dataset_id),
    schemaVersion: Number(row.schema_version),
    displayName: String(row.display_name),
    source: String(row.source),
    partitionKey: String(row.partition_key),
    logicalUri: String(row.logical_uri),
    state: row.state as DataPlatformDataset["state"],
    startDate: isoDay(row.start_date),
    endDate: isoDay(row.end_date),
    readyPartitions: Number(row.ready_partitions),
    failedPartitions: Number(row.failed_partitions),
    missingPartitions: Number(row.missing_partitions),
    totalPartitions: Number(row.total_partitions),
    totalRows: Number(row.total_rows),
    totalBytes: Number(row.total_bytes),
    estimatedTotalBytes: Number(row.estimated_total_bytes),
    watermark: optionalDay(row.watermark),
    untrackedFileCount: Number(row.untracked_file_count),
    observedAt: isoDate(row.observed_at),
    registeredAt: isoDate(row.registered_at),
  };
}

function partitionFromRow(row: postgres.Row): DataPlatformPartition {
  return {
    datasetId: String(row.dataset_id),
    schemaVersion: Number(row.schema_version),
    partitionKey: String(row.partition_key),
    partitionValue: isoDay(row.partition_value),
    sourcePartition: String(row.source_partition),
    state: row.state as DataPlatformPartition["state"],
    validationState: String(row.validation_state),
    logicalUri: String(row.logical_uri),
    checksum: optionalString(row.checksum),
    rowCount: optionalNumber(row.row_count),
    fileSizeBytes: optionalNumber(row.file_size_bytes),
    estimatedBytes: optionalNumber(row.estimated_bytes),
    errorCode: optionalString(row.error_code),
    observedAt: isoDate(row.observed_at),
  };
}

function storageFromRow(row: postgres.Row): DataPlatformStorageSnapshot {
  return {
    storageId: String(row.storage_id),
    logicalUri: String(row.logical_uri),
    capacityBytes: Number(row.capacity_bytes),
    usedBytes: Number(row.used_bytes),
    availableBytes: Number(row.available_bytes),
    observedAt: isoDate(row.observed_at),
  };
}

function datasetKey(datasetId: string, schemaVersion: number) {
  return `${datasetId}:v${schemaVersion}`;
}

function optionalString(value: unknown) {
  return value === null || value === undefined ? undefined : String(value);
}

function optionalNumber(value: unknown) {
  return value === null || value === undefined ? undefined : Number(value);
}

function optionalDate(value: unknown) {
  return value === null || value === undefined ? undefined : isoDate(value);
}

function optionalDay(value: unknown) {
  return value === null || value === undefined ? undefined : isoDay(value);
}

function isoDay(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isoDate(value: unknown) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}
