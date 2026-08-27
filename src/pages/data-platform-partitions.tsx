/** Dataset 分区完整性与容量明细页面。 */
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Filter, Rows3 } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type {
  DataPlatformConfig,
  DataPlatformDataset,
  DataPlatformPartitionPage,
  DataPlatformPartitionState,
} from "@/types";
import {
  CatalogPageSkeleton,
  CatalogStateBadge,
  DataPlatformUnavailable,
  formatBytes,
} from "./data-platform-shared";

const PAGE_SIZE = 100;

export function DataPlatformPartitionsPage() {
  const [datasetId, setDatasetId] = useState("");
  const [state, setState] = useState<"all" | DataPlatformPartitionState>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const configQuery = useQuery({
    queryKey: ["data-platform", "config"],
    queryFn: () => api<DataPlatformConfig>("/api/data-platform/config"),
  });
  const datasetsQuery = useQuery({
    queryKey: ["data-platform", "datasets"],
    queryFn: () => api<DataPlatformDataset[]>("/api/data-platform/datasets"),
    enabled: configQuery.data?.available === true,
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

  if (configQuery.isLoading) return <CatalogPageSkeleton />;
  if (!configQuery.data?.available) return <DataPlatformUnavailable />;

  const datasets = datasetsQuery.data ?? [];
  const page = partitionsQuery.data;
  const selectedDataset = datasets.find(
    (dataset) => dataset.datasetId === selectedDatasetId,
  );
  const canPrevious = offset > 0;
  const canNext = Boolean(page && offset + page.items.length < page.total);

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
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-muted-foreground" />
            <span className="font-mono">
              {selectedDataset.startDate} → {selectedDataset.endDate}
            </span>
          </div>
          <div className="font-mono text-muted-foreground">
            watermark {selectedDataset.watermark ?? "—"} ·{" "}
            {selectedDataset.totalPartitions.toLocaleString()} tracked
          </div>
        </div>
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
            <div className="flex items-center justify-between border-b px-4 py-3 text-xs text-muted-foreground">
              <span>
                Showing {offset + 1}–{offset + page.items.length} of{" "}
                {page.total.toLocaleString()}
              </span>
              <span className="font-mono">100 rows / page</span>
            </div>
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
            <div className="flex justify-end gap-2 border-t p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!canPrevious}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canNext}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
