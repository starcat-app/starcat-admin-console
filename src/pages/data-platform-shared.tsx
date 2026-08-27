/** 数据平台 Catalog 页面共享的只读展示与 Job 轮询工具。 */
import {
  AlertCircle,
  CheckCircle2,
  HardDrive,
  LoaderCircle,
} from "lucide-react";

import { EmptyState } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  DataPlatformDatasetState,
  DataPlatformJob,
  DataPlatformPartitionState,
} from "@/types";

export function DataPlatformUnavailable() {
  return (
    <EmptyState
      icon={HardDrive}
      title="Local data platform is not configured"
      description="请先配置 PostgreSQL Catalog、Trainer Root 与 BigQuery billing project，再重启本机 BFF。"
    />
  );
}

export function CatalogPageSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

export function CatalogStateBadge({
  state,
}: {
  state: DataPlatformDatasetState | DataPlatformPartitionState;
}) {
  const success = state === "ready";
  const warning = state === "partial" || state === "missing";
  const Icon = success ? CheckCircle2 : warning ? LoaderCircle : AlertCircle;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-mono text-[10px] uppercase",
        success && "border-emerald-300 text-emerald-700 dark:text-emerald-300",
        warning && "border-amber-300 text-amber-700 dark:text-amber-300",
        !success && !warning && "border-red-300 text-red-700 dark:text-red-300",
      )}
    >
      <Icon className={cn("size-3", warning && "animate-pulse")} />
      {state}
    </Badge>
  );
}

/**
 * Raw 完整性检查需要逐文件读取 footer 与 checksum，等待窗口必须覆盖大目录检查时间。
 * 页面只轮询稳定 Job 状态，不读取子进程日志或真实路径。
 */
export async function waitForDataPlatformJob(jobId: string) {
  for (let attempt = 0; attempt < 1_200; attempt += 1) {
    const job = await api<DataPlatformJob>(`/api/data-platform/jobs/${jobId}`);
    if (job.state === "succeeded") return job;
    if (["failed", "cancelled", "interrupted"].includes(job.state)) {
      throw new Error(job.errorSummary ?? `任务结束：${job.state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    "Dataset 登记等待超时，请在 BigQuery operations 中检查 Job 状态",
  );
}

export function formatBytes(value?: number | null) {
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
