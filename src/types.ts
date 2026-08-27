/** 浏览器端公开 DTO；刻意不包含任何密钥值。 */
export type EnvironmentId = "test" | "production";

export const serviceIds = [
  "sharing",
  "trending",
  "weekly",
  "wiki",
  "recommend",
  "discovery",
] as const;

export type ServiceId = (typeof serviceIds)[number];
export type SecretKind = "apiKey" | "adminKey";
export type AgentRuntimeId = "codex" | "claude" | "openai-compatible";

export interface LocalAgentStatus {
  runtime: "codex" | "claude";
  available: boolean;
  command: string;
  version?: string;
  error?: string;
}

export interface SecretState {
  configured: boolean;
  fingerprint?: string;
}

export interface PublicConfig {
  profiles: Record<
    EnvironmentId,
    {
      gatewayURL: string;
      services: Record<ServiceId, { baseURL: string }>;
    }
  >;
  agent: { runtime: AgentRuntimeId; baseURL: string; model: string };
  fly: {
    apiBaseURL: string;
    apps: Record<ServiceId, string>;
  };
  secrets: {
    profiles: Record<
      EnvironmentId,
      Record<ServiceId, Record<SecretKind, SecretState>>
    >;
    productionSharedApiKey: SecretState;
    agentApiKey: SecretState;
    githubToken: SecretState;
    flyToken: SecretState;
  };
  dataDirectory: string;
}

export interface ServiceAction {
  id: string;
  label: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  destructive: boolean;
  description: string;
  fields?: Array<{
    name: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
}

export interface ServiceResource {
  id: string;
  label: string;
  path: string;
  description: string;
}

export interface ServiceStatus {
  id: ServiceId;
  label: string;
  description: string;
  readOnly: boolean;
  online: boolean;
  authenticated: boolean;
  latencyMs: number;
  stats: Array<{
    id: string;
    label: string;
    value: unknown;
    description: string;
    error?: string;
  }>;
  resources: ServiceResource[];
  actions: ServiceAction[];
  credentialKinds: SecretKind[];
  credentials: Record<SecretKind, SecretState>;
}

export type MetricsRange = "1h" | "24h" | "7d" | "30d" | "180d";
export type MetricsMetric =
  | "requests"
  | "errors"
  | "error_rate"
  | "latency_average"
  | "latency_p50"
  | "latency_p95"
  | "latency_p99";

export interface MetricsSummary {
  service: string;
  from: string;
  to: string;
  request_count: number;
  error_count: number;
  error_rate: number;
  average_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  maximum_ms: number;
  response_bytes: number;
}

export interface MetricsPoint {
  timestamp: string;
  value: number;
}

export interface RouteMetric {
  route: string;
  method: string;
  request_count: number;
  error_count: number;
  error_rate: number;
  average_ms: number;
  p95_ms: number;
  maximum_ms: number;
}

export interface ServiceObservability {
  id: ServiceId;
  label: string;
  ok: boolean;
  error?: string;
  summary: MetricsSummary | null;
  timeseries: {
    service: string;
    metric: MetricsMetric;
    interval: string;
    from: string;
    to: string;
    points: MetricsPoint[];
  } | null;
  routes: RouteMetric[];
  statusCodes: Array<{ status_class: string; request_count: number }>;
}

export interface AwesomeSource {
  id: string;
  repo_full_name: string;
  display_name: string;
  image_url: string;
  summary_zh: string;
  summary_en: string;
  featured: boolean;
  sort_order: number;
  revision?: number;
  status?: string;
  last_synced_at?: string;
}

export interface ImportFinding {
  id: string;
  original: string;
  title?: string;
  status: "confirmed" | "needs_review" | "not_found";
  confidence: number;
  reason: string;
  repository: string | null;
  candidate: GitHubCandidate | null;
  candidates: GitHubCandidate[];
  selected: boolean;
}

/** Weekly 服务端目录中的人工导入分类；code 是发布 payload 的稳定标识。 */
export interface WeeklyImportSource {
  code: string;
  display_name_zh: string;
  display_name_en: string;
  icon_key: string;
  sort_order: number;
  count: number;
  ingest_mode: string;
  enabled: boolean;
  manual_import_enabled: boolean;
}

export interface GitHubCandidate {
  fullName: string;
  htmlURL: string;
  description: string;
  stars: number;
  language: string | null;
  ownerAvatar: string;
  archived: boolean;
  readmeExcerpt: string;
  matchedBy: string;
}

export interface ActivityEntry {
  id: string;
  createdAt: string;
  environment: EnvironmentId;
  title: string;
  detail: string;
  outcome: "success" | "failed" | "running";
}

export type DataPlatformJobState =
  | "queued"
  | "running"
  | "cancel_requested"
  | "cancelled"
  | "succeeded"
  | "failed"
  | "interrupted";

export interface DataPlatformConfig {
  available: boolean;
  billingProject?: string;
  location?: string;
  maximumBytesBilled?: number;
  maximumResultRows?: number;
  maximumResultBytes?: number;
}

export interface BigQueryQuota {
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

export interface BigQueryDownloadStatus {
  event: "WatchEvent" | "PushEvent";
  state: "running" | "stopped";
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

export interface DataPlatformOverview {
  config: Omit<DataPlatformConfig, "available">;
  downloads: BigQueryDownloadStatus[];
  jobs: DataPlatformJob[];
}

export type DataPlatformDatasetState = "ready" | "partial" | "degraded";
export type DataPlatformPartitionState = "ready" | "failed" | "missing";

export interface DataPlatformDataset {
  datasetId: string;
  schemaVersion: number;
  displayName: string;
  source: string;
  partitionKey: string;
  logicalUri: string;
  state: DataPlatformDatasetState;
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
  state: DataPlatformPartitionState;
  validationState: string;
  logicalUri: string;
  checksum?: string;
  rowCount?: number;
  fileSizeBytes?: number;
  estimatedBytes?: number;
  errorCode?: string;
  observedAt: string;
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

export interface BigQueryField {
  name: string;
  field_type: string;
  mode: string;
}

export interface SqlLabDryRunResult {
  operation: "dry_run";
  sql_sha256: string;
  statement_type: string;
  estimated_bytes: number;
  maximum_bytes_billed: number;
  fields: BigQueryField[];
  referenced_tables: string[];
}

export interface SqlLabQueryResult {
  operation: "query";
  sql_sha256: string;
  job_id: string;
  estimated_bytes: number;
  processed_bytes: number;
  billed_bytes: number;
  maximum_bytes_billed: number;
  total_rows: number;
  returned_rows: number;
  truncated: boolean;
  fields: BigQueryField[];
  rows: Array<Record<string, unknown>>;
}
