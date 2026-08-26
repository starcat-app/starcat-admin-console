/**
 * 数据平台 PostgreSQL Catalog。
 *
 * Catalog 只保存任务控制元数据和 BigQuery 计费摘要，不保存 SQL 文本或结果行。
 * 测试使用同一接口的内存实现，生产路径没有 SQLite 或文件回退，避免出现双真源。
 */
import postgres, { type Sql } from "postgres";

import type { DataPlatformJob, JobUpdate } from "./types.js";

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
    await this.sql`
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
    await this.sql`
      CREATE INDEX IF NOT EXISTS data_platform_jobs_created_at_idx
      ON data_platform_jobs (created_at DESC)
    `;
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

  async markStaleJobsInterrupted() {
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

  async markStaleJobsInterrupted() {
    for (const [jobId, job] of this.jobs) {
      if (["queued", "running", "cancel_requested"].includes(job.state)) {
        this.jobs.set(jobId, {
          ...job,
          state: "interrupted",
          stage: "interrupted",
          errorCode: "BFF_RESTARTED",
          finishedAt: new Date().toISOString(),
        });
      }
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

function optionalString(value: unknown) {
  return value === null || value === undefined ? undefined : String(value);
}

function optionalNumber(value: unknown) {
  return value === null || value === undefined ? undefined : Number(value);
}

function optionalDate(value: unknown) {
  return value === null || value === undefined ? undefined : isoDate(value);
}

function isoDate(value: unknown) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}
