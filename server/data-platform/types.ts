/** 本地数据平台控制面的稳定 Job、Dataset、Partition 与存储类型。 */

export const downloadEventIds = ["watch-events", "push-events"] as const;
export const downloadActionIds = ["start", "stop", "restart"] as const;

export type DownloadEventId = (typeof downloadEventIds)[number];
export type DownloadActionId = (typeof downloadActionIds)[number];

export const catalogActionIds = [
  "lake.register-existing-watch-events",
  "lake.register-existing-push-events",
] as const;

export type CatalogActionId = (typeof catalogActionIds)[number];
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

export type DatasetState = "ready" | "partial" | "degraded";
export type PartitionState = "ready" | "failed" | "missing";

export interface DataPlatformDataset {
  datasetId: string;
  schemaVersion: number;
  displayName: string;
  source: string;
  partitionKey: string;
  logicalUri: string;
  state: DatasetState;
  startDate: string;
  endDate: string;
  readyPartitions: number;
  failedPartitions: number;
  missingPartitions: number;
  totalPartitions: number;
  totalRows: number;
  totalBytes: number;
  estimatedTotalBytes: number;
  watermark?: string;
  untrackedFileCount: number;
  observedAt: string;
  registeredAt: string;
}

export interface DataPlatformPartition {
  datasetId: string;
  schemaVersion: number;
  partitionKey: string;
  partitionValue: string;
  sourcePartition: string;
  state: PartitionState;
  validationState: string;
  logicalUri: string;
  checksum?: string;
  rowCount?: number;
  fileSizeBytes?: number;
  estimatedBytes?: number;
  errorCode?: string;
  observedAt: string;
}

export interface DataPlatformPartitionQuery {
  datasetId: string;
  schemaVersion?: number;
  state?: PartitionState;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface DataPlatformPartitionPage {
  items: DataPlatformPartition[];
  total: number;
  limit: number;
  offset: number;
}

export interface DataPlatformStorageSnapshot {
  storageId: string;
  logicalUri: string;
  capacityBytes: number;
  usedBytes: number;
  availableBytes: number;
  observedAt: string;
}

/**
 * Trainer 只读检查完成后的原子登记载荷。
 *
 * 该对象只允许逻辑 URI；真实磁盘路径只能停留在 BFF 进程参数中。
 */
export interface DatasetInventory {
  dataset: DataPlatformDataset;
  partitions: DataPlatformPartition[];
  storage: DataPlatformStorageSnapshot;
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
