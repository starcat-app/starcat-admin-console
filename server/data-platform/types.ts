/** 本地数据平台控制面的稳定 Job、下载任务与查询结果类型。 */

export const downloadEventIds = ["watch-events", "push-events"] as const;
export const downloadActionIds = ["start", "stop", "restart"] as const;

export type DownloadEventId = (typeof downloadEventIds)[number];
export type DownloadActionId = (typeof downloadActionIds)[number];
export type DataPlatformJobState =
  | "queued"
  | "running"
  | "cancel_requested"
  | "cancelled"
  | "succeeded"
  | "failed"
  | "interrupted";

export interface DataPlatformJob {
  jobId: string;
  actionId: string;
  state: DataPlatformJobState;
  stage: string;
  inputHash: string;
  sqlHash?: string;
  bigQueryJobId?: string;
  estimatedBytes?: number;
  processedBytes?: number;
  billedBytes?: number;
  errorCode?: string;
  errorSummary?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  resultAvailable: boolean;
}

export interface DownloadStatus {
  schema_version: number;
  event: "WatchEvent" | "PushEvent";
  command: string;
  state: "running" | "stopped";
  screen_session: string;
  worker_pid: number | null;
  quota_monitor_pid: number | null;
  start_date: string;
  end_date: string;
  total_partitions: number;
  completed_partitions: number;
  last_partition: string | null;
  estimated_total_bytes: number;
  checkpoint_error: string | null;
  quota: BigQueryQuota | null;
  quota_error: string | null;
}

export interface BigQueryQuota {
  schema_version: number;
  query_jobs: number;
  billed_bytes: number;
  processed_bytes: number;
  free_tier_bytes: number;
  remaining_bytes: number;
  used_percent: number;
  warning_percent: number;
  stop_percent: number;
  status: string;
  should_stop: boolean;
}

export interface SqlLabJobInput {
  sql: string;
  maximumBytesBilled: number;
  expectedSqlSha256?: string;
  maximumResultRows?: number;
}

export interface JobUpdate {
  state?: DataPlatformJobState;
  stage?: string;
  sqlHash?: string;
  bigQueryJobId?: string;
  estimatedBytes?: number;
  processedBytes?: number;
  billedBytes?: number;
  errorCode?: string;
  errorSummary?: string;
  startedAt?: string;
  finishedAt?: string;
  resultAvailable?: boolean;
}
