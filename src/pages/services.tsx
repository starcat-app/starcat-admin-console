import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { KeyRound, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { EnvironmentMark, PageHeader } from "@/components/app-shell";
import { ServiceActionButton } from "@/components/service-action";
import { StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useConsole } from "@/console-context";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ServiceId, ServiceStatus } from "@/types";

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

            <div className="grid gap-px border-b bg-border sm:grid-cols-3">
              <InfoTile
                icon={ShieldCheck}
                label="Authentication"
                value={current.authenticated ? "Verified" : "Not verified"}
              />
              <InfoTile
                icon={KeyRound}
                label="Admin key"
                value={
                  current.credentials.adminKey.configured
                    ? `•••• ${current.credentials.adminKey.fingerprint ?? ""}`
                    : "Not configured"
                }
              />
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
