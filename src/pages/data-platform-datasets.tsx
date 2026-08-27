/** Dataset Catalog 与既有 Raw 原地登记页面。 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  Database,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  Rows3,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  DataPlatformConfig,
  DataPlatformDataset,
  DataPlatformJob,
} from "@/types";
import {
  CatalogPageSkeleton,
  CatalogStateBadge,
  DataPlatformUnavailable,
  formatBytes,
  waitForDataPlatformJob,
} from "./data-platform-shared";

type RegistrationAction =
  "lake.register-existing-watch-events" | "lake.register-existing-push-events";

const registrationTargets = [
  {
    actionId: "lake.register-existing-watch-events" as const,
    name: "WatchEvent Raw",
    description: "登记 Star 历史与协同过滤使用的 WatchEvent 日分区。",
  },
  {
    actionId: "lake.register-existing-push-events" as const,
    name: "PushEvent Raw",
    description: "登记仓库活跃度特征使用的 PushEvent 日分区。",
  },
];

export function DataPlatformDatasetsPage() {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<RegistrationAction>();
  const configQuery = useQuery({
    queryKey: ["data-platform", "config"],
    queryFn: () => api<DataPlatformConfig>("/api/data-platform/config"),
  });
  const datasetsQuery = useQuery({
    queryKey: ["data-platform", "datasets"],
    queryFn: () => api<DataPlatformDataset[]>("/api/data-platform/datasets"),
    enabled: configQuery.data?.available === true,
  });
  const registration = useMutation({
    mutationFn: async (actionId: RegistrationAction) => {
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
          queryKey: ["data-platform", "storage"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["data-platform", "overview"],
        }),
      ]);
      toast.success("Raw Dataset 已完成只读检查并登记到 Catalog");
    },
    onError: (error) => toast.error(error.message),
  });

  if (configQuery.isLoading) return <CatalogPageSkeleton />;
  if (!configQuery.data?.available) return <DataPlatformUnavailable />;

  const datasets = datasetsQuery.data ?? [];
  const totalPartitions = datasets.reduce(
    (total, dataset) => total + dataset.totalPartitions,
    0,
  );
  const readyPartitions = datasets.reduce(
    (total, dataset) => total + dataset.readyPartitions,
    0,
  );
  const rawBytes = datasets.reduce(
    (total, dataset) => total + dataset.totalBytes,
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Local data platform / Catalog"
        title="Datasets"
        description="把 T0 上的既有 BigQuery Raw 原地登记为可查询的 Dataset 清单。登记只读检查文件，不移动、不复制，也不会向浏览器暴露真实路径。"
        actions={
          <Button
            variant="outline"
            onClick={() => datasetsQuery.refetch()}
            disabled={datasetsQuery.isFetching}
          >
            <RefreshCw
              className={datasetsQuery.isFetching ? "animate-spin" : undefined}
            />
            Refresh
          </Button>
        }
      />

      <div className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Registered datasets" value={String(datasets.length)} />
        <Metric
          label="Ready partitions"
          value={readyPartitions.toLocaleString()}
        />
        <Metric
          label="Tracked partitions"
          value={totalPartitions.toLocaleString()}
        />
        <Metric label="Raw footprint" value={formatBytes(rawBytes)} />
      </div>

      <section className="mt-10">
        <SectionHeading
          title="Register existing Raw"
          description="固定动作会调用 Trainer 的只读检查命令，并在完整成功后以单个 PostgreSQL 事务替换 Catalog 快照。"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {registrationTargets.map((target) => (
            <article
              key={target.actionId}
              className="group relative overflow-hidden rounded-xl border bg-card p-5"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-foreground/75" />
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
                    <ArchiveRestore className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{target.name}</h3>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      {target.description}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setPendingAction(target.actionId)}
                  disabled={registration.isPending}
                >
                  {registration.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <FileCheck2 />
                  )}
                  Inspect & register
                </Button>
              </div>
              <div className="mt-5 truncate rounded-lg bg-muted/45 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {target.actionId}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          title="Catalog inventory"
          description="只展示逻辑 URI、完整性状态和统计摘要；Raw 文件仍由本地数据湖独占保存。"
        />
        {datasetsQuery.isLoading ? (
          <CatalogPageSkeleton />
        ) : datasets.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No datasets registered"
            description="从上方选择 WatchEvent 或 PushEvent，执行一次既有 Raw 只读登记。"
          />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Partition coverage</TableHead>
                  <TableHead>Rows / bytes</TableHead>
                  <TableHead>Watermark</TableHead>
                  <TableHead>Observed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((dataset) => (
                  <TableRow
                    key={`${dataset.datasetId}:${dataset.schemaVersion}`}
                  >
                    <TableCell>
                      <div className="font-medium">{dataset.displayName}</div>
                      <div className="mt-1 max-w-96 truncate font-mono text-[11px] text-muted-foreground">
                        {dataset.logicalUri}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CatalogStateBadge state={dataset.state} />
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">
                        {dataset.readyPartitions.toLocaleString()} ready /{" "}
                        {dataset.totalPartitions.toLocaleString()}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {dataset.failedPartitions} failed ·{" "}
                        {dataset.missingPartitions} missing
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">
                        {dataset.totalRows.toLocaleString()} rows
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {formatBytes(dataset.totalBytes)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {dataset.watermark ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(dataset.observedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <RegistrationDialog
        actionId={pendingAction}
        running={registration.isPending}
        onClose={() => setPendingAction(undefined)}
        onConfirm={() => pendingAction && registration.mutate(pendingAction)}
      />
    </>
  );
}

function RegistrationDialog({
  actionId,
  running,
  onClose,
  onConfirm,
}: {
  actionId?: RegistrationAction;
  running: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={Boolean(actionId)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认登记既有 Raw Dataset</DialogTitle>
          <DialogDescription>
            将逐分区检查 Parquet footer、列结构、行数和 SHA-256。该动作只读，
            不会移动、复制或删除 T0 上的文件。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs">
          {actionId}
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={onConfirm} disabled={running}>
            {running ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <FileCheck2 />
            )}
            Confirm inspection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b p-5 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-r xl:border-b-0 xl:last:border-r-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">
        {value}
      </div>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4 flex flex-col justify-between gap-2 md:flex-row md:items-end">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Rows3 className="size-4 text-muted-foreground" /> {title}
      </h2>
      <p className="max-w-2xl text-sm text-muted-foreground md:text-right">
        {description}
      </p>
    </div>
  );
}
