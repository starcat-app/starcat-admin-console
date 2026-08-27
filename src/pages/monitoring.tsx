/**
 * 六个基础服务的统一 API 调用监控。
 *
 * 页面只消费 BFF 聚合后的时间桶和路由模板，不接触 API Key，也不会展示真实
 * path 参数、查询串、请求正文或客户端地址。
 */
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EnvironmentMark, PageHeader } from "@/components/app-shell";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginateItems,
  TablePagination,
} from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConsole } from "@/console-context";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type {
  MetricsMetric,
  MetricsRange,
  ServiceId,
  ServiceObservability,
} from "@/types";

const ranges: MetricsRange[] = ["1h", "24h", "7d", "30d", "180d"];
const metrics: Array<{ id: MetricsMetric; label: string }> = [
  { id: "requests", label: "Requests" },
  { id: "errors", label: "Errors" },
  { id: "error_rate", label: "Error rate" },
  { id: "latency_average", label: "Average latency" },
  { id: "latency_p95", label: "P95 latency" },
  { id: "latency_p99", label: "P99 latency" },
];
const colors = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#0891b2",
  "#dc2626",
];

export function MonitoringPage() {
  const { environment } = useConsole();
  const [range, setRange] = useState<MetricsRange>("24h");
  const [metric, setMetric] = useState<MetricsMetric>("requests");
  const [service, setService] = useState<ServiceId | "all">("all");
  const [routePage, setRoutePage] = useState(1);
  const query = useQuery({
    queryKey: ["observability", environment, range, metric],
    queryFn: () =>
      api<ServiceObservability[]>(
        `/api/services/observability?environment=${environment}&range=${range}&metric=${metric}`,
      ),
    refetchInterval: 60_000,
  });
  const services = query.data ?? [];
  const visible =
    service === "all"
      ? services
      : services.filter((item) => item.id === service);
  const chartData = useMemo(() => mergeSeries(visible), [visible]);
  const summary = useMemo(() => aggregateSummary(visible), [visible]);
  const routes = visible
    .flatMap((item) =>
      item.routes.map((route) => ({ ...route, service: item.label })),
    )
    .sort((a, b) => b.request_count - a.request_count)
    .slice(0, 30);
  const visibleRoutes = paginateItems(
    routes,
    routePage,
    DEFAULT_TABLE_PAGE_SIZE,
  );

  return (
    <div>
      <PageHeader
        eyebrow="Service observability"
        title="API Monitoring"
        description="集中查看 Sharing、Trending、Weekly、Wiki、Recommend 与 Discovery 的调用量、错误率、延迟和路由排名。"
        actions={
          <>
            <EnvironmentMark />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
            >
              <RefreshCw /> Refresh
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2 rounded-lg border bg-card p-3">
        <Select
          value={service}
          onValueChange={(value) => {
            setService(value as ServiceId | "all");
            setRoutePage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {services.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={range}
          onValueChange={(value) => {
            setRange(value as MetricsRange);
            setRoutePage(1);
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ranges.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={metric}
          onValueChange={(value) => {
            setMetric(value as MetricsMetric);
            setRoutePage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {metrics.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-500" /> Auto refresh
          60s
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Requests"
          value={formatNumber(summary.requests)}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Errors"
          value={formatNumber(summary.errors)}
          detail={`${(summary.errorRate * 100).toFixed(2)}% error rate`}
        />
        <MetricCard
          icon={Clock3}
          label="Average latency"
          value={`${summary.average.toFixed(1)} ms`}
        />
        <MetricCard
          icon={Clock3}
          label="Highest P95"
          value={`${summary.p95.toFixed(1)} ms`}
        />
      </div>

      <div className="mt-6 rounded-lg border bg-card p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Traffic timeseries</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              固定时间桶聚合，不保存原始请求。
            </p>
          </div>
          <Badge variant="secondary">{chartData.length} points</Badge>
        </div>
        <div className="h-[360px]">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 18, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimestamp}
                  minTickGap={36}
                  tick={{ fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11 }} width={54} />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(String(value)).toLocaleString()
                  }
                />
                <Legend />
                {visible.map((item, index) => (
                  <Line
                    key={item.id}
                    type="monotone"
                    dataKey={item.id}
                    name={item.label}
                    stroke={colors[index % colors.length]}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              {query.isLoading
                ? "Loading metrics…"
                : "No metrics in this range."}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-5">
          <h2 className="text-sm font-semibold">Route ranking</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            路由模板按调用量排序，动态仓库 ID 与分享 ID 不进入统计。
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Route template</th>
                <th className="px-4 py-3 text-right">Requests</th>
                <th className="px-4 py-3 text-right">Errors</th>
                <th className="px-4 py-3 text-right">P95</th>
              </tr>
            </thead>
            <tbody>
              {visibleRoutes.map((route) => (
                <tr
                  key={`${route.service}-${route.method}-${route.route}`}
                  className="border-b last:border-0"
                >
                  <td className="px-4 py-3">{route.service}</td>
                  <td className="px-4 py-3 font-mono">{route.method}</td>
                  <td className="px-4 py-3 font-mono">{route.route}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(route.request_count)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(route.error_count)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {route.p95_ms.toFixed(1)} ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!routes.length && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No route metrics.
          </div>
        )}
        <TablePagination
          page={routePage}
          totalItems={routes.length}
          onPageChange={setRoutePage}
        />
      </div>
    </div>
  );
}

function mergeSeries(services: ServiceObservability[]) {
  const rows = new Map<string, Record<string, string | number>>();
  for (const service of services)
    for (const point of service.timeseries?.points ?? []) {
      const row = rows.get(point.timestamp) ?? { timestamp: point.timestamp };
      row[service.id] = point.value;
      rows.set(point.timestamp, row);
    }
  return [...rows.values()].sort((a, b) =>
    String(a.timestamp).localeCompare(String(b.timestamp)),
  );
}

function aggregateSummary(services: ServiceObservability[]) {
  let requests = 0,
    errors = 0,
    duration = 0,
    p95 = 0;
  for (const service of services)
    if (service.summary) {
      requests += service.summary.request_count;
      errors += service.summary.error_count;
      duration += service.summary.average_ms * service.summary.request_count;
      p95 = Math.max(p95, service.summary.p95_ms);
    }
  return {
    requests,
    errors,
    errorRate: requests ? errors / requests : 0,
    average: requests ? duration / requests : 0,
    p95,
  };
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {detail && (
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      )}
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}
