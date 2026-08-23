import { useQuery } from "@tanstack/react-query";
import { Braces, Copy, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EnvironmentMark, PageHeader } from "@/components/app-shell";
import { ServiceActionButton } from "@/components/service-action";
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
import type { ServiceId, ServiceStatus } from "@/types";

export function ExplorerPage() {
  const { environment } = useConsole();
  const query = useQuery({
    queryKey: ["services", environment],
    queryFn: () =>
      api<ServiceStatus[]>(`/api/services?environment=${environment}`),
  });
  const [serviceId, setServiceId] = useState<ServiceId>("weekly");
  const service = query.data?.find((item) => item.id === serviceId);
  return (
    <div>
      <PageHeader
        eyebrow="Allowlisted operations"
        title="API explorer"
        description="浏览并执行服务注册表中明确开放的动作。这里不提供任意 URL、Method 或 Header 输入。"
        actions={<EnvironmentMark />}
      />
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-lg border bg-card p-5">
          <label className="text-xs font-medium">Service</label>
          <Select
            value={serviceId}
            onValueChange={(value) => setServiceId(value as ServiceId)}
          >
            <SelectTrigger className="mt-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {query.data?.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-6 rounded-md border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Braces className="size-4" /> Safety model
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              请求路径、鉴权类型与动作风险均来自
              server/service-registry.ts，页面不能覆盖。
            </p>
          </div>
        </section>
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">
              {service?.label ?? "Service"} endpoints
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {service?.description}
            </p>
          </div>
          <div className="divide-y">
            {service?.actions.length ? (
              service.actions.map((action) => (
                <div
                  key={action.id}
                  className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          action.method === "GET" ? "secondary" : "default"
                        }
                      >
                        {action.method}
                      </Badge>
                      <code className="truncate text-xs">{action.path}</code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(action.path);
                          toast.success("Path copied");
                        }}
                      >
                        <Copy />
                      </Button>
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      {action.label}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                  <ServiceActionButton service={service.id} action={action} />
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Play className="mx-auto mb-3 size-5" />
                该服务没有登记可执行动作。
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
