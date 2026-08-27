/** Dataset 分区完整性、Catalog 快照与实时下载进度对照页面。 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  CheckCircle2,
  DatabaseZap,
  Filter,
  LoaderCircle,
  RefreshCw,
  Rows3,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/status";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  TablePagination,
} from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type {
  BigQueryDownloadStatus,
  DataPlatformConfig,
  DataPlatformDataset,
  DataPlatformJob,
  DataPlatformPartitionPage,
  DataPlatformPartitionState,
} from "@/types";
import {
  CatalogRegistrationDialog,
  type CatalogRegistrationAction,
} from "./data-platform-catalog-registration";
import {
  CatalogPageSkeleton,
  CatalogStateBadge,
  DataPlatformUnavailable,
  formatBytes,
  waitForDataPlatformJob,
} from "./data-platform-shared";

const PAGE_SIZE = DEFAULT_TABLE_PAGE_SIZE;

const catalogRuntimeByDataset: Record<
  string,
  {
    event: BigQueryDownloadStatus["event"];
    actionId: CatalogRegistrationAction;
  }
> = {
  githubarchive_watch_event: {
    event: "WatchEvent",
    actionId: "lake.register-existing-watch-events",
  },
  githubarchive_push_event: {
    event: "PushEvent",
    actionId: "lake.register-existing-push-events",
  },
};

export function DataPlatformPartitionsPage() {
  const queryClient = useQueryClient();
  const [datasetId, setDatasetId] = useState("");
  const [state, setState] = useState<"all" | DataPlatformPartitionState>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [pendingAction, setPendingAction] =
    useState<CatalogRegistrationAction>();
  const configQuery = useQuery({
    queryKey: ["data-platform", "config"],
    queryFn: () => api<DataPlatformConfig>("/api/data-platform/config"),
  });
  const datasetsQuery = useQuery({
    queryKey: ["data-platform", "datasets"],
    queryFn: () => api<DataPlatformDataset[]>("/api/data-platform/datasets"),
    enabled: configQuery.data?.available === true,
  });
  const downloadsQuery = useQuery({
    queryKey: ["data-platform", "downloads"],
    queryFn: () =>
      api<BigQueryDownloadStatus[]>("/api/data-platform/bigquery/downloads"),
    enabled: configQuery.data?.available === true,
    // BFF 与 Trainer 本身已有 30 秒状态缓存；页面同频轮询即可，不放大额度查询。
    refetchInterval: 30_000,
  });
  // 首个 Dataset 只是展示默认值，不需要 Effect 再写一次 state，避免无意义的级联渲染。
  const selectedDatasetId =
    datasetId || datasetsQuery.data?.[0]?.datasetId || "";
  const partitionsQuery = useQuery({
    queryKey: [
      "data-platform",
      "partitions",
      selectedDatasetId,
      state,
      dateFrom,
      dateTo,
      offset,
    ],
    queryFn: () => {
      const query = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (state !== "all") query.set("state", state);
      if (dateFrom) query.set("dateFrom", dateFrom);
      if (dateTo) query.set("dateTo", dateTo);
      return api<DataPlatformPartitionPage>(
        `/api/data-platform/datasets/${encodeURIComponent(selectedDatasetId)}/partitions?${query}`,
      );
    },
    enabled: Boolean(selectedDatasetId),
  });
  const registration = useMutation({
    mutationFn: async (actionId: CatalogRegistrationAction) => {
      const job = await api<DataPlatformJob>(
        `/api/data-platform/actions/${actionId}/jobs`,
        { method: "POST", body: "{}" },
      );
      return waitForDataPlatformJob(job.jobId);
    },
    onSuccess: async () => {
      setPendingAction(undefined);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["data-platform", "datasets"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["data-platform", "partitions"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["data-platform", "storage"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["data-platform", "overview"],
        }),
      ]);
      toast.success("Catalog 快照已刷新");
    },
    onError: (error) => toast.error(error.message),
  });

  if (configQuery.isLoading) return <CatalogPageSkeleton />;
  if (!configQuery.data?.available) return <DataPlatformUnavailable />;

  const datasets = datasetsQuery.data ?? [];
  const page = partitionsQuery.data;
  const selectedDataset = datasets.find(
    (dataset) => dataset.datasetId === selectedDatasetId,
  );
  const runtimeTarget = catalogRuntimeByDataset[selectedDatasetId];
  const downloadStatus = downloadsQuery.data?.find(
    (download) => download.event === runtimeTarget?.event,
  );
  // failed 分区已经被 Catalog 观察到，因此只把未进入当前快照的下载完成分区算作落后量。
  const catalogAccountedPartitions = selectedDataset
    ? selectedDataset.readyPartitions + selectedDataset.failedPartitions
    : 0;
  const catalogLag = Math.max(
    0,
    (downloadStatus?.completed_partitions ?? 0) - catalogAccountedPartitions,
  );
  function resetOffset() {
    setOffset(0);
  }

  return (
    <>
      <PageHeader
        eyebrow="Local data platform / Catalog"
        title="Partitions"
        description="按 Dataset、完整性状态和日期范围检查日分区。页面读取 PostgreSQL Catalog，不会直接扫描 T0 文件。"
      />

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="size-4 text-muted-foreground" /> Catalog filters
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Dataset
            </span>
            <Select
              value={selectedDatasetId}
              onValueChange={(value) => {
                setDatasetId(value);
                resetOffset();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a dataset" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.datasetId} value={dataset.datasetId}>
                    {dataset.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              State
            </span>
            <Select
              value={state}
              onValueChange={(value) => {
                setState(value as "all" | DataPlatformPartitionState);
                resetOffset();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Date from
            </span>
            <Input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => {
                setDateFrom(event.target.value);
                resetOffset();
              }}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Date to
            </span>
            <Input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => {
                setDateTo(event.target.value);
                resetOffset();
              }}
            />
          </label>
        </div>
      </div>

      {selectedDataset ? (
        <CatalogRuntimeStatus
          dataset={selectedDataset}
          download={downloadStatus}
          downloadLoading={downloadsQuery.isLoading}
          downloadError={downloadsQuery.isError}
          catalogLag={catalogLag}
          canRegister={Boolean(runtimeTarget)}
          registering={registration.isPending}
          onRegister={() =>
            runtimeTarget && setPendingAction(runtimeTarget.actionId)
          }
        />
      ) : null}

      <section className="mt-5">
        {datasetsQuery.isLoading || partitionsQuery.isLoading ? (
          <CatalogPageSkeleton />
        ) : datasets.length === 0 ? (
          <EmptyState
            icon={Rows3}
            title="No dataset inventory"
            description="先到 Datasets 页面登记 WatchEvent 或 PushEvent Raw，再查看分区明细。"
          />
        ) : !page?.items.length ? (
          <EmptyState
            icon={Filter}
            title="No partitions match these filters"
            description="调整状态或日期范围；Catalog 中的原始分区记录不会被修改。"
          />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>File size</TableHead>
                    <TableHead>Estimated scan</TableHead>
                    <TableHead>Checksum / error</TableHead>
                    <TableHead>Logical URI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.items.map((partition) => (
                    <TableRow key={partition.partitionValue}>
                      <TableCell className="font-mono text-xs font-medium">
                        {partition.partitionValue}
                      </TableCell>
                      <TableCell>
                        <CatalogStateBadge state={partition.state} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {partition.rowCount?.toLocaleString() ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatBytes(partition.fileSizeBytes)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatBytes(partition.estimatedBytes)}
                      </TableCell>
                      <TableCell className="max-w-52">
                        <div
                          className="truncate font-mono text-[11px] text-muted-foreground"
                          title={partition.checksum ?? partition.errorCode}
                        >
                          {partition.errorCode ?? partition.checksum ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-96">
                        <div
                          className="truncate font-mono text-[11px] text-muted-foreground"
                          title={partition.logicalUri}
                        >
                          {partition.logicalUri}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              page={Math.floor(offset / PAGE_SIZE) + 1}
              pageSize={PAGE_SIZE}
              totalItems={page.total}
              onPageChange={(nextPage) => setOffset((nextPage - 1) * PAGE_SIZE)}
            />
          </div>
        )}
      </section>

      <CatalogRegistrationDialog
        actionId={pendingAction}
        running={registration.isPending}
        onClose={() => setPendingAction(undefined)}
        onConfirm={() => pendingAction && registration.mutate(pendingAction)}
      />
    </>
  );
}

function CatalogRuntimeStatus({
  dataset,
  download,
  downloadLoading,
  downloadError,
  catalogLag,
  canRegister,
  registering,
  onRegister,
}: {
  dataset: DataPlatformDataset;
  download?: BigQueryDownloadStatus;
  downloadLoading: boolean;
  downloadError: boolean;
  catalogLag: number;
  canRegister: boolean;
  registering: boolean;
  onRegister: () => void;
}) {
  const progress = download
    ? (download.completed_partitions / download.total_partitions) * 100
    : 0;

  return (
    <section className="mt-5 overflow-hidden rounded-xl border bg-card">
      <div className="grid gap-5 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <DatabaseZap className="size-3.5" /> Catalog snapshot
          </div>
          <div className="mt-2 font-mono text-sm font-medium">
            {dataset.readyPartitions.toLocaleString()} ready · watermark{" "}
            {dataset.watermark ?? "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Observed {relativeTime(dataset.observedAt)} ·{" "}
            <span className="font-mono">
              {new Date(dataset.observedAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarRange className="size-3.5" /> Live downloader
          </div>
          {downloadLoading ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Reading status…
            </div>
          ) : downloadError || !download ? (
            <div className="mt-2 text-sm text-red-600 dark:text-red-300">
              Live download status unavailable
            </div>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-sm font-medium">
                {download.state === "running" ? (
                  <LoaderCircle className="size-4 animate-spin text-emerald-600" />
                ) : (
                  <CheckCircle2 className="size-4 text-muted-foreground" />
                )}
                {download.state} ·{" "}
                {download.completed_partitions.toLocaleString()}/
                {download.total_partitions.toLocaleString()} · latest{" "}
                {formatPartitionDay(download.last_partition)}
              </div>
              <Progress
                className="mt-2"
                value={progress}
                aria-label={`${download.event} download progress`}
              />
            </>
          )}
        </div>

        <Button
          variant="outline"
          onClick={onRegister}
          disabled={!canRegister || registering}
        >
          <RefreshCw className={registering ? "animate-spin" : undefined} />
          Refresh Catalog snapshot
        </Button>
      </div>

      {catalogLag > 0 ? (
        <div
          role="status"
          className="flex gap-3 border-t border-amber-300/70 bg-amber-50/70 px-4 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="text-sm font-semibold">
              Catalog snapshot is behind live download
            </div>
            <p className="mt-0.5 text-xs leading-5 opacity-80">
              至少 {catalogLag.toLocaleString()} 个已下载分区尚未进入当前
              Catalog 快照。MISSING
              只表示快照中没有该分区，并不等于下载失败；点击刷新可重新只读登记。
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatPartitionDay(value: string | null) {
  if (!value || !/^\d{8}$/.test(value)) return "—";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
