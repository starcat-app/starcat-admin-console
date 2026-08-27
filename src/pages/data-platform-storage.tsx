/** 本地数据卷容量与 Dataset 占用摘要页面。 */
import { useQuery } from "@tanstack/react-query";
import { Database, HardDrive, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/status";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type {
  DataPlatformConfig,
  DataPlatformDataset,
  DataPlatformStorageSnapshot,
} from "@/types";
import {
  CatalogPageSkeleton,
  DataPlatformUnavailable,
  formatBytes,
} from "./data-platform-shared";

export function DataPlatformStoragePage() {
  const configQuery = useQuery({
    queryKey: ["data-platform", "config"],
    queryFn: () => api<DataPlatformConfig>("/api/data-platform/config"),
  });
  const storageQuery = useQuery({
    queryKey: ["data-platform", "storage"],
    queryFn: () =>
      api<DataPlatformStorageSnapshot[]>("/api/data-platform/storage"),
    enabled: configQuery.data?.available === true,
  });
  const datasetsQuery = useQuery({
    queryKey: ["data-platform", "datasets"],
    queryFn: () => api<DataPlatformDataset[]>("/api/data-platform/datasets"),
    enabled: configQuery.data?.available === true,
  });

  if (configQuery.isLoading) return <CatalogPageSkeleton />;
  if (!configQuery.data?.available) return <DataPlatformUnavailable />;

  const snapshots = storageQuery.data ?? [];
  const datasets = datasetsQuery.data ?? [];
  const registeredBytes = datasets.reduce(
    (total, dataset) => total + dataset.totalBytes,
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Local data platform / Capacity"
        title="Storage"
        description="查看本地数据卷的容量水位与已登记 Dataset 占用。容量来自最近一次只读登记快照，不会在页面加载时扫描磁盘。"
      />

      {storageQuery.isLoading ? (
        <CatalogPageSkeleton />
      ) : snapshots.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No storage snapshot"
          description="登记任意一个既有 Raw Dataset 后，Catalog 会保存对应数据卷的脱敏容量快照。"
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-5">
            {snapshots.map((snapshot) => {
              const usedPercent =
                snapshot.capacityBytes > 0
                  ? (snapshot.usedBytes / snapshot.capacityBytes) * 100
                  : 0;
              return (
                <article
                  key={snapshot.storageId}
                  className="overflow-hidden rounded-xl border bg-card"
                >
                  <div className="flex items-start justify-between gap-4 border-b p-5">
                    <div className="flex gap-3">
                      <div className="grid size-10 place-items-center rounded-lg bg-foreground text-background">
                        <HardDrive className="size-5" />
                      </div>
                      <div>
                        <h2 className="font-semibold">Primary data volume</h2>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {snapshot.logicalUri}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="size-4" /> logical URI only
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                          Volume used
                        </div>
                        <div className="mt-2 font-mono text-4xl font-semibold tracking-[-0.045em]">
                          {usedPercent.toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-right font-mono text-xs text-muted-foreground">
                        <div>{formatBytes(snapshot.usedBytes)} used</div>
                        <div className="mt-1">
                          {formatBytes(snapshot.availableBytes)} available
                        </div>
                      </div>
                    </div>
                    <Progress
                      value={Math.min(usedPercent, 100)}
                      className="mt-5 h-2"
                    />
                    <div className="mt-5 grid overflow-hidden rounded-lg border sm:grid-cols-3">
                      <StorageMetric
                        label="Capacity"
                        value={formatBytes(snapshot.capacityBytes)}
                      />
                      <StorageMetric
                        label="Available"
                        value={formatBytes(snapshot.availableBytes)}
                      />
                      <StorageMetric
                        label="Observed"
                        value={relativeTime(snapshot.observedAt)}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">Registered Raw</h2>
            </div>
            <div className="mt-6 font-mono text-3xl font-semibold tracking-tight">
              {formatBytes(registeredBytes)}
            </div>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              当前 Catalog 中所有 Dataset 的 Parquet
              文件大小合计。它不是卷总占用， 也不会把同一份 Raw 复制到
              PostgreSQL。
            </p>
            <div className="mt-6 space-y-3 border-t pt-4">
              {datasets.map((dataset) => (
                <div
                  key={`${dataset.datasetId}:${dataset.schemaVersion}`}
                  className="flex items-center justify-between gap-4 text-xs"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    {dataset.displayName}
                  </span>
                  <span className="shrink-0 font-mono">
                    {formatBytes(dataset.totalBytes)}
                  </span>
                </div>
              ))}
              {datasets.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  暂无已登记 Dataset。
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function StorageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-mono text-sm font-medium">{value}</div>
    </div>
  );
}
