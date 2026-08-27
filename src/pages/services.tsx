import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import {
  Database,
  KeyRound,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { EnvironmentMark, PageHeader } from "@/components/app-shell";
import { ServiceActionButton } from "@/components/service-action";
import { StatusBadge } from "@/components/status";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginateItems,
  TablePagination,
} from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useConsole } from "@/console-context";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ServiceId, ServiceResource, ServiceStatus } from "@/types";

export function ServicesPage() {
  const { environment } = useConsole();
  const search = useSearch({ strict: false }) as { service?: ServiceId };
  const [selected, setSelected] = useState<ServiceId | undefined>(
    search.service,
  );
  const query = useQuery({
    queryKey: ["services", environment],
    queryFn: () =>
      api<ServiceStatus[]>(`/api/services?environment=${environment}`),
  });
  const current = useMemo(
    () => query.data?.find((item) => item.id === selected) ?? query.data?.[0],
    [query.data, selected],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Service registry"
        title="Services"
        description="每个服务仅开放已登记的统计接口与运维动作，避免控制台退化为任意请求代理。"
        actions={
          <>
            <EnvironmentMark />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
            >
              <RefreshCw /> Refresh all
            </Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Registered services
          </div>
          <div className="p-2">
            {(query.data ?? []).map((service) => (
              <button
                key={service.id}
                onClick={() => setSelected(service.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-3 text-left transition-colors hover:bg-muted",
                  current?.id === service.id && "bg-muted",
                )}
              >
                <div>
                  <div className="text-sm font-medium">{service.label}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {service.id}
                  </div>
                </div>
                <span
                  className={cn(
                    "size-2 rounded-full",
                    service.online ? "bg-emerald-500" : "bg-red-400",
                  )}
                />
              </button>
            ))}
            {query.isLoading && (
              <div className="p-3 text-sm text-muted-foreground">
                Loading services…
              </div>
            )}
          </div>
        </div>

        {current && (
          <div className="min-w-0 rounded-lg border bg-card">
            <div className="flex flex-col justify-between gap-4 border-b p-5 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg border bg-muted">
                    <Server className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{current.label}</h2>
                    <p className="text-sm text-muted-foreground">
                      {current.description}
                    </p>
                  </div>
                </div>
              </div>
              <StatusBadge ok={current.online}>
                {current.online ? "Online" : "Unavailable"}
              </StatusBadge>
            </div>

            <div
              className={cn(
                "grid gap-px border-b bg-border",
                current.credentialKinds.includes("adminKey")
                  ? "sm:grid-cols-4"
                  : "sm:grid-cols-3",
              )}
            >
              <InfoTile
                icon={ShieldCheck}
                label="Authentication"
                value={current.authenticated ? "Verified" : "Not verified"}
              />
              <InfoTile
                icon={KeyRound}
                label={
                  environment === "production" ? "Shared API key" : "API key"
                }
                value={
                  current.credentials.apiKey.configured
                    ? `•••• ${current.credentials.apiKey.fingerprint ?? ""}`
                    : "Not configured"
                }
              />
              {current.credentialKinds.includes("adminKey") && (
                <InfoTile
                  icon={KeyRound}
                  label="Admin key"
                  value={
                    current.credentials.adminKey.configured
                      ? `•••• ${current.credentials.adminKey.fingerprint ?? ""}`
                      : "Not configured"
                  }
                />
              )}
              <InfoTile
                icon={RefreshCw}
                label="Latency"
                value={
                  current.latencyMs ? `${current.latencyMs} ms` : "No response"
                }
              />
            </div>

            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Statistics</h3>
                <Badge variant="secondary">{current.stats.length} fields</Badge>
              </div>
              {current.stats.length ? (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                  {current.stats.map((stat) => (
                    <div key={stat.id} className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">
                        {stat.label}
                      </div>
                      <div className="mt-2 text-2xl font-semibold tracking-tight">
                        {formatNumber(stat.value)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {stat.error ?? stat.description}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  该服务暂未登记全局统计接口。
                </p>
              )}

              <Separator className="my-6" />
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Data resources</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    只读展示服务登记过的数据与诊断结果，不接受任意 URL。
                  </p>
                </div>
                <Badge variant="secondary">
                  {current.resources.length} views
                </Badge>
              </div>
              {current.resources.length ? (
                <ServiceResources
                  key={current.id}
                  service={current.id}
                  resources={current.resources}
                  environment={environment}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  该服务暂无数据视图。
                </p>
              )}

              <Separator className="my-6" />
              <div className="mb-4">
                <h3 className="text-sm font-semibold">Registered actions</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  破坏性动作会额外要求确认；生产环境同样允许写入。
                </p>
              </div>
              {current.actions.length ? (
                <div className="space-y-3">
                  {current.actions.map((action) => (
                    <div
                      key={action.id}
                      className="flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {action.label}
                          {action.destructive && (
                            <Badge variant="destructive">Destructive</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {action.description} ·{" "}
                          <code>
                            {action.method} {action.path}
                          </code>
                        </p>
                      </div>
                      <ServiceActionButton
                        service={current.id}
                        action={action}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  该服务当前只有只读检查，没有管理动作。
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceResources({
  service,
  resources,
  environment,
}: {
  service: ServiceId;
  resources: ServiceResource[];
  environment: string;
}) {
  const [selected, setSelected] = useState(resources[0]?.id);
  const resource =
    resources.find((item) => item.id === selected) ?? resources[0];
  const query = useQuery({
    queryKey: ["service-resource", environment, service, resource?.id],
    enabled: Boolean(resource),
    queryFn: () =>
      api<{ ok: boolean; body: unknown; error?: string }>(
        `/api/services/${service}/resources/${resource.id}?environment=${environment}`,
      ),
  });
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-wrap gap-2 border-b bg-muted/30 p-2">
        {resources.map((item) => (
          <Button
            key={item.id}
            variant={item.id === resource.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSelected(item.id)}
          >
            <Database /> {item.label}
          </Button>
        ))}
      </div>
      <div className="p-4">
        <div className="mb-3">
          <div className="text-sm font-medium">{resource.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {resource.description} · <code>{resource.path}</code>
          </div>
        </div>
        {query.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading resource…</div>
        ) : query.isError ? (
          <div className="text-sm text-destructive">{query.error.message}</div>
        ) : (
          <ResourceTable key={resource.id} value={query.data?.body} />
        )}
      </div>
    </div>
  );
}

function ResourceTable({ value }: { value: unknown }) {
  const [page, setPage] = useState(1);
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  const candidate = record?.data ?? value;
  const rows = Array.isArray(candidate)
    ? candidate
    : candidate
      ? [candidate]
      : [];
  const objects = rows.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
  const columns = [
    ...new Set(objects.flatMap((row) => Object.keys(row))),
  ].slice(0, 10);
  // 服务资源接口当前最多返回 50 条；分页只改变展示密度，不扩大既有读取范围。
  const boundedObjects = objects.slice(0, 50);
  const visibleObjects = paginateItems(
    boundedObjects,
    page,
    DEFAULT_TABLE_PAGE_SIZE,
  );
  if (!objects.length)
    return <div className="text-sm text-muted-foreground">No data.</div>;
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="border-b text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-2 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleObjects.map((row, index) => (
              <tr key={index} className="border-b last:border-0">
                {columns.map((column) => (
                  <td
                    key={column}
                    className="max-w-64 truncate px-2 py-2 font-mono"
                  >
                    {formatCell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page}
        totalItems={boundedObjects.length}
        onPageChange={setPage}
      />
    </div>
  );
}

function formatCell(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-2 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
