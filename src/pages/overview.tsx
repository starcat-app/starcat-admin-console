import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Database,
  KeyRound,
  RefreshCw,
  Server,
} from "lucide-react";

import { EnvironmentMark, PageHeader } from "@/components/app-shell";
import { EmptyState, StatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConsole } from "@/console-context";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { ServiceStatus } from "@/types";

export function OverviewPage() {
  const { environment, activity } = useConsole();
  const services = useQuery({
    queryKey: ["services", environment],
    queryFn: () =>
      api<ServiceStatus[]>(`/api/services?environment=${environment}`),
    refetchInterval: 60_000,
  });
  const rows = services.data ?? [];
  const online = rows.filter((service) => service.online).length;
  const configured = rows.filter(
    (service) => service.credentials.apiKey.configured,
  ).length;
  const statTotal = rows.reduce(
    (sum, service) =>
      sum + service.stats.filter((stat) => stat.value != null).length,
    0,
  );

  return (
    <div>
      <PageHeader
        eyebrow="Operations dashboard"
        title="System overview"
        description="统一查看 Starcat 配套 API 的可用性、鉴权状态和核心数据；所有请求均经本地 BFF 转发。"
        actions={
          <>
            <EnvironmentMark />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void services.refetch()}
              disabled={services.isFetching}
            >
              <RefreshCw
                className={services.isFetching ? "animate-spin" : ""}
              />{" "}
              Refresh
            </Button>
          </>
        }
      />

      <section className="grid border-y sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Server}
          label="Services online"
          value={services.isLoading ? undefined : `${online} / ${rows.length}`}
          hint="Health and optional ping"
        />
        <Metric
          icon={KeyRound}
          label="API keys ready"
          value={
            services.isLoading ? undefined : `${configured} / ${rows.length}`
          }
          hint="Current environment"
        />
        <Metric
          icon={Database}
          label="Stats available"
          value={services.isLoading ? undefined : formatNumber(statTotal)}
          hint="Successfully resolved fields"
        />
        <Metric
          icon={Activity}
          label="Session actions"
          value={formatNumber(activity.length)}
          hint="Redacted local history"
        />
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Service health</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              按当前环境实时检查，不把上游密钥发送给浏览器。
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/services">
              View details <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          {services.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : services.isError ? (
            <div className="p-5">
              <EmptyState
                icon={Server}
                title="BFF 请求失败"
                description={services.error.message}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Auth</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Key metric</TableHead>
                  <TableHead className="text-right">Explore</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell>
                      <div className="font-medium">{service.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {service.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge ok={service.online}>
                        {service.online ? "Online" : "Unavailable"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {service.authenticated
                          ? "Verified"
                          : service.credentials.apiKey.configured
                            ? "Failed"
                            : "Not configured"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {service.latencyMs ? `${service.latencyMs} ms` : "—"}
                    </TableCell>
                    <TableCell>
                      {service.stats[0] ? (
                        <>
                          <span className="font-semibold">
                            {formatNumber(service.stats[0].value)}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {service.stats[0].label}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/services" search={{ service: service.id }}>
                          Open <ArrowRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
  hint: string;
}) {
  return (
    <div className="border-b px-5 py-6 last:border-b-0 sm:nth-[2]:border-l xl:border-b-0 xl:border-l xl:first:border-l-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      {value == null ? (
        <Skeleton className="mt-4 h-8 w-20" />
      ) : (
        <div className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          {value}
        </div>
      )}
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
