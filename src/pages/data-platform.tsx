/**
 * 本机数据平台工作台。
 *
 * 页面只调用同源 BFF 的固定 Action Job；SQL 不写入 localStorage，也不拼进 URL。
 * dry run 返回的 hash 是正式执行的前置凭证，任意编辑都会立即使该凭证失效。
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  CircleStop,
  Clock3,
  Database,
  HardDrive,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { EmptyState, StatusBadge } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  BigQueryDownloadStatus,
  DataPlatformConfig,
  DataPlatformJob,
  DataPlatformOverview,
  SqlLabDryRunResult,
  SqlLabQueryResult,
} from "@/types";

const DEFAULT_SQL = `SELECT
  type,
  COUNT(*) AS event_count
FROM \`githubarchive.day.20260825\`
GROUP BY type
ORDER BY event_count DESC
LIMIT 50`;

type DownloadAction = "start" | "stop" | "restart";
type DownloadEvent = "watch-events" | "push-events";

interface PendingDownloadAction {
  event: DownloadEvent;
  label: string;
  action: DownloadAction;
}

export function DataPlatformPage() {
  const queryClient = useQueryClient();
  const [sql, setSQL] = useState(DEFAULT_SQL);
  const [budgetMiB, setBudgetMiB] = useState(4096);
  const [maximumRows, setMaximumRows] = useState(100);
  const [dryRun, setDryRun] = useState<SqlLabDryRunResult>();
  const [queryResult, setQueryResult] = useState<SqlLabQueryResult>();
  const [pendingDownload, setPendingDownload] =
    useState<PendingDownloadAction>();

  const config = useQuery({
    queryKey: ["data-platform", "config"],
    queryFn: () => api<DataPlatformConfig>("/api/data-platform/config"),
    staleTime: 30_000,
  });
  const overview = useQuery({
    queryKey: ["data-platform", "overview"],
    queryFn: () => api<DataPlatformOverview>("/api/data-platform/overview"),
    enabled: config.data?.available === true,
    refetchInterval: 30_000,
  });

  const dryRunMutation = useMutation({
    mutationFn: () =>
      submitAndWait<SqlLabDryRunResult>(
        "/api/data-platform/bigquery/sql/dry-run",
        {
          sql,
          maximumBytesBilled: mibToBytes(budgetMiB),
        },
      ),
    onSuccess: ({ result }) => {
      setDryRun(result);
      setQueryResult(undefined);
      void queryClient.invalidateQueries({
        queryKey: ["data-platform", "overview"],
      });
      toast.success("Dry run 已通过，可以执行查询");
    },
    onError: (error) => toast.error(error.message),
  });

  const queryMutation = useMutation({
    mutationFn: async () => {
      if (!dryRun) throw new Error("请先执行 dry run");
      return submitAndWait<SqlLabQueryResult>(
        "/api/data-platform/bigquery/sql/query",
        {
          sql,
          maximumBytesBilled: mibToBytes(budgetMiB),
          expectedSqlSha256: dryRun.sql_sha256,
          maximumResultRows: maximumRows,
        },
      );
    },
    onSuccess: ({ result }) => {
      setQueryResult(result);
      void queryClient.invalidateQueries({
        queryKey: ["data-platform", "overview"],
      });
      toast.success(`查询完成，返回 ${result.returned_rows} 行`);
    },
    onError: (error) => toast.error(error.message),
  });

  const downloadMutation = useMutation({
    mutationFn: async (input: PendingDownloadAction) => {
      const job = await api<DataPlatformJob>(
        `/api/data-platform/bigquery/downloads/${input.event}/${input.action}`,
        { method: "POST", body: "{}" },
      );
      return waitForJob(job.jobId);
    },
    onSuccess: () => {
      setPendingDownload(undefined);
      void queryClient.invalidateQueries({
        queryKey: ["data-platform", "overview"],
      });
      toast.success("下载任务动作已完成");
    },
    onError: (error) => toast.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) =>
      api<DataPlatformJob>(`/api/data-platform/jobs/${jobId}/cancel`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["data-platform", "overview"],
      }),
    onError: (error) => toast.error(error.message),
  });

  const invalidateSQLPreview = (update: () => void) => {
    update();
    setDryRun(undefined);
    setQueryResult(undefined);
  };

  if (config.isLoading) return <DataPlatformSkeleton />;
  if (config.isError) {
    return (
      <EmptyState
        icon={Database}
        title="无法读取数据平台配置"
        description={config.error.message}
      />
    );
  }
  if (!config.data?.available) {
    return (
      <div>
        <PageHeader
          eyebrow="Local data platform"
          title="BigQuery operations"
          description="数据平台尚未启用；配置本机 PostgreSQL、Trainer 根目录和 GCP billing project 后即可使用。"
        />
        <EmptyState
          icon={HardDrive}
          title="Data platform is not configured"
          description="请在 .env.local 中设置 STARCAT_DATA_PLATFORM_DATABASE_URL、STARCAT_TRAINER_ROOT 与 STARCAT_BQ_BILLING_PROJECT，然后重启控制台。"
        />
      </div>
    );
  }

  const data = overview.data;
  const quota = data?.downloads.find((item) => item.quota)?.quota;
  const busy = dryRunMutation.isPending || queryMutation.isPending;

  return (
    <div>
      <PageHeader
        eyebrow="Local data platform"
        title="BigQuery operations"
        description="在一个本机控制面内查看免费额度、管理 WatchEvent / PushEvent 下载，并通过受控 SQL Lab 验证 githubarchive 数据。"
        actions={
          <>
            <Badge variant="outline" className="gap-1.5 font-mono">
              <HardDrive className="size-3" /> 127.0.0.1
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void overview.refetch()}
              disabled={overview.isFetching}
            >
              <RefreshCw
                className={overview.isFetching ? "animate-spin" : ""}
              />
              Refresh
            </Button>
          </>
        }
      />

      {overview.isError ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle />
          <AlertTitle>数据平台状态读取失败</AlertTitle>
          <AlertDescription>{overview.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid overflow-hidden rounded-xl border bg-card lg:grid-cols-[1.4fr_1fr]">
        <div className="border-b p-6 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Monthly query free tier
              </div>
              <div className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
                {quota ? `${quota.used_percent.toFixed(2)}%` : "—"}
              </div>
            </div>
            <StatusBadge
              ok={quota ? !quota.should_stop : false}
              pending={!quota}
            >
              {quota?.status ?? "Loading quota"}
            </StatusBadge>
          </div>
          <Progress
            className="mt-6 h-2"
            value={Math.min(quota?.used_percent ?? 0, 100)}
          />
          <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
            <span>Billed {formatBytes(quota?.billed_bytes)}</span>
            <span>Remaining {formatBytes(quota?.remaining_bytes)}</span>
            <span>{quota?.query_jobs ?? 0} query jobs</span>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x">
          <Metric label="Billing project" value={data?.config.billingProject} />
          <Metric label="Location" value={data?.config.location} />
        </div>
      </section>

      <SectionTitle
        eyebrow="Acquisition"
        title="Download tasks"
        description="脚本继续负责 screen、checkpoint、磁盘保护和断点续传；控制台只触发固定生命周期动作。"
      />
      <section className="grid gap-4 lg:grid-cols-2">
        {data?.downloads.map((download) => (
          <DownloadCard
            key={download.event}
            status={download}
            onAction={(action) =>
              setPendingDownload({
                event:
                  download.event === "WatchEvent"
                    ? "watch-events"
                    : "push-events",
                label: download.event,
                action,
              })
            }
          />
        )) ?? [0, 1].map((key) => <Skeleton key={key} className="h-64" />)}
      </section>

      <SectionTitle
        eyebrow="Exploration"
        title="SQL Lab"
        description="仅允许单条 SELECT / WITH SELECT，且只能引用 githubarchive；每次正式查询前都必须通过相同 SQL 与预算的 dry run。"
      />
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.6fr)]">
          <div className="border-b lg:border-r lg:border-b-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TerminalSquare className="size-4" /> Query editor
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">
                SELECT ONLY
              </Badge>
            </div>
            <Textarea
              aria-label="BigQuery SQL"
              value={sql}
              onChange={(event) =>
                invalidateSQLPreview(() => setSQL(event.target.value))
              }
              spellCheck={false}
              className="min-h-72 resize-y rounded-none border-0 bg-zinc-950 p-5 font-mono text-[13px] leading-6 text-zinc-100 shadow-none focus-visible:ring-0 dark:bg-black"
            />
          </div>
          <div className="p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Execution guardrails
            </div>
            <label className="mt-5 block text-xs font-medium">
              Maximum billed MiB
              <Input
                className="mt-2 font-mono"
                type="number"
                min={1}
                max={10240}
                value={budgetMiB}
                onChange={(event) =>
                  invalidateSQLPreview(() =>
                    setBudgetMiB(clampNumber(event.target.value, 1, 10240)),
                  )
                }
              />
            </label>
            <label className="mt-4 block text-xs font-medium">
              Maximum result rows
              <Input
                className="mt-2 font-mono"
                type="number"
                min={1}
                max={200}
                value={maximumRows}
                onChange={(event) =>
                  setMaximumRows(clampNumber(event.target.value, 1, 200))
                }
              />
            </label>

            <div className="mt-6 space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
              <Guard label="SQL temp file" value="0600 / auto-delete" />
              <Guard
                label="Query budget"
                value={formatBytes(mibToBytes(budgetMiB))}
              />
              <Guard label="Result cap" value={`${maximumRows} rows / 2 MiB`} />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => dryRunMutation.mutate()}
                disabled={busy || !sql.trim()}
              >
                {dryRunMutation.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <ShieldCheck />
                )}
                Dry run
              </Button>
              <Button
                onClick={() => queryMutation.mutate()}
                disabled={busy || !dryRun}
              >
                {queryMutation.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Play />
                )}
                Execute
              </Button>
            </div>
          </div>
        </div>

        {dryRun ? <DryRunSummary result={dryRun} /> : null}
        {queryResult ? <QueryResultTable result={queryResult} /> : null}
      </section>

      <SectionTitle
        eyebrow="Audit"
        title="Recent jobs"
        description="PostgreSQL 只保存动作、状态、hash 和计费摘要；SQL 明文与查询结果不会进入 Catalog。"
      />
      <JobsTable
        jobs={data?.jobs ?? []}
        loading={!data}
        cancelling={cancelMutation.isPending}
        onCancel={(jobId) => cancelMutation.mutate(jobId)}
      />

      <DownloadActionDialog
        pending={pendingDownload}
        running={downloadMutation.isPending}
        onClose={() => setPendingDownload(undefined)}
        onConfirm={() => {
          if (pendingDownload) downloadMutation.mutate(pendingDownload);
        }}
      />
    </div>
  );
}

function DownloadCard({
  status,
  onAction,
}: {
  status: BigQueryDownloadStatus;
  onAction: (action: DownloadAction) => void;
}) {
  const progress = status.total_partitions
    ? (status.completed_partitions / status.total_partitions) * 100
    : 0;
  const running = status.state === "running";
  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            <h3 className="font-semibold">{status.event}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.start_date} → {status.end_date}
          </p>
        </div>
        <StatusBadge ok={running} pending={running}>
          {running ? "Running" : "Stopped"}
        </StatusBadge>
      </div>
      <div className="mt-7 flex items-end justify-between gap-4">
        <div className="text-3xl font-semibold tracking-[-0.04em]">
          {progress.toFixed(1)}%
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {status.completed_partitions} / {status.total_partitions} partitions
        </div>
      </div>
      <Progress className="mt-3 h-1.5" value={Math.min(progress, 100)} />
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-muted-foreground">Last partition</div>
          <div className="mt-1 font-mono font-medium">
            {status.last_partition ?? "—"}
          </div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-muted-foreground">Estimated scan</div>
          <div className="mt-1 font-mono font-medium">
            {formatBytes(status.estimated_total_bytes)}
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={running}
          onClick={() => onAction("start")}
        >
          <Play /> Start
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!running}
          onClick={() => onAction("stop")}
        >
          <CircleStop /> Stop
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAction("restart")}>
          <RotateCcw /> Restart
        </Button>
      </div>
    </article>
  );
}

function DryRunSummary({ result }: { result: SqlLabDryRunResult }) {
  return (
    <div className="border-t bg-emerald-50/50 px-5 py-4 dark:bg-emerald-500/5">
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="size-4" /> Dry run passed
      </div>
      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
        <Guard
          label="Estimated scan"
          value={formatBytes(result.estimated_bytes)}
        />
        <Guard label="Statement" value={result.statement_type} />
        <Guard
          label="Referenced tables"
          value={String(result.referenced_tables.length)}
        />
      </div>
      <div className="mt-3 truncate font-mono text-[11px] text-muted-foreground">
        {result.sql_sha256}
      </div>
    </div>
  );
}

function QueryResultTable({ result }: { result: SqlLabQueryResult }) {
  const columns = result.fields.map((field) => field.name);
  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Braces className="size-4" /> Query result
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
          <span>{result.returned_rows} returned</span>
          <span>{formatBytes(result.processed_bytes)} processed</span>
          <span>{formatBytes(result.billed_bytes)} billed</span>
          {result.truncated ? <Badge variant="outline">TRUNCATED</Badge> : null}
        </div>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column}
                  className="whitespace-nowrap font-mono text-xs"
                >
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell
                    key={column}
                    className="max-w-96 truncate font-mono text-xs"
                    title={displayCell(row[column])}
                  >
                    {displayCell(row[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function JobsTable({
  jobs,
  loading,
  cancelling,
  onCancel,
}: {
  jobs: DataPlatformJob[];
  loading: boolean;
  cancelling: boolean;
  onCancel: (jobId: string) => void;
}) {
  if (loading) return <Skeleton className="h-64" />;
  if (!jobs.length) {
    return (
      <EmptyState
        icon={Clock3}
        title="No data platform jobs yet"
        description="下载动作、dry run 与正式查询会在这里留下不含 SQL 正文的审计记录。"
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>State</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Cost summary</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Control</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const active = ["queued", "running", "cancel_requested"].includes(
              job.state,
            );
            return (
              <TableRow key={job.jobId}>
                <TableCell>
                  <JobStateBadge state={job.state} />
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs font-medium">
                    {job.actionId}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {job.jobId}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {job.billedBytes != null
                    ? `${formatBytes(job.billedBytes)} billed`
                    : job.estimatedBytes != null
                      ? `${formatBytes(job.estimatedBytes)} estimated`
                      : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {relativeTime(job.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={cancelling}
                      onClick={() => onCancel(job.jobId)}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {job.errorCode ?? job.stage}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function DownloadActionDialog({
  pending,
  running,
  onClose,
  onConfirm,
}: {
  pending?: PendingDownloadAction;
  running: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认下载任务动作</DialogTitle>
          <DialogDescription>
            将对 {pending?.label} 执行 {pending?.action}。Restart 会先停止当前
            worker， 再从现有 checkpoint 继续下载。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs">
          bigquery.{pending?.event}.{pending?.action}
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={onConfirm} disabled={running}>
            {running ? <LoaderCircle className="animate-spin" /> : <Play />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mt-12 mb-4 flex flex-col justify-between gap-2 md:flex-row md:items-end">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground md:text-right">
        {description}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid place-content-center p-5 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-mono text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function Guard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function JobStateBadge({ state }: { state: DataPlatformJob["state"] }) {
  const active = ["queued", "running", "cancel_requested"].includes(state);
  const success = state === "succeeded";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-mono text-[10px] uppercase",
        success && "border-emerald-300 text-emerald-700 dark:text-emerald-300",
        active && "border-blue-300 text-blue-700 dark:text-blue-300",
        !success && !active && "border-red-300 text-red-700 dark:text-red-300",
      )}
    >
      {active ? <LoaderCircle className="size-3 animate-spin" /> : null}
      {state}
    </Badge>
  );
}

function DataPlatformSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

async function submitAndWait<T>(path: string, body: Record<string, unknown>) {
  const queued = await api<DataPlatformJob>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const job = await waitForJob(queued.jobId);
  const result = await api<T>(`/api/data-platform/jobs/${job.jobId}/result`);
  return { job, result };
}

async function waitForJob(jobId: string) {
  // BFF 的 SQL 超时是 120 秒；页面多留 30 秒给排队和 Catalog 写入。
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const job = await api<DataPlatformJob>(`/api/data-platform/jobs/${jobId}`);
    if (job.state === "succeeded") return job;
    if (["failed", "cancelled", "interrupted"].includes(job.state)) {
      throw new Error(job.errorSummary ?? `任务结束：${job.state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("任务等待超时，请在 Recent jobs 中检查状态");
}

function mibToBytes(value: number) {
  return value * (1 << 20);
}

function clampNumber(value: string, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function formatBytes(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = value;
  let unit = 0;
  while (Math.abs(amount) >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : amount >= 100 ? 0 : 2)} ${units[unit]}`;
}

function displayCell(value: unknown) {
  if (value == null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
