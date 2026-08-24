import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Cloud,
  KeyRound,
  RefreshCw,
  Save,
  Server,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { api, jsonBody } from "@/lib/api";
import type { PublicConfig } from "@/types";

interface FlyApp {
  service: string;
  app: string;
  ok: boolean;
  status: number;
  error?: string;
}
interface LocalVariable {
  name: string;
  configured: boolean;
}
interface FlySecret {
  name: string;
  digest?: string;
  created_at?: string;
}

export function FlySettingsPage() {
  const client = useQueryClient();
  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: () => api<PublicConfig>("/api/config"),
  });
  const [flyDraft, setFlyDraft] = useState<Partial<PublicConfig["fly"]>>({});
  const fly = configQuery.data
    ? {
        ...configQuery.data.fly,
        ...flyDraft,
        apps: { ...configQuery.data.fly.apps, ...flyDraft.apps },
      }
    : undefined;
  const setFly = (next: PublicConfig["fly"]) => setFlyDraft(next);
  const [token, setToken] = useState("");
  const [secretService, setSecretService] =
    useState<keyof PublicConfig["fly"]["apps"]>("weekly");
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const apps = useQuery({
    queryKey: ["fly-apps"],
    queryFn: () => api<FlyApp[]>("/api/fly/apps"),
    enabled: !!configQuery.data?.secrets.flyToken.configured,
  });
  const saveConfig = useMutation({
    mutationFn: () =>
      api("/api/config/fly", { method: "PUT", ...jsonBody(fly) }),
    onSuccess: () => {
      toast.success("Fly 配置已保存");
      void client.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const saveToken = useMutation({
    mutationFn: () =>
      api("/api/config/secrets/flyToken", {
        method: "PUT",
        ...jsonBody({ value: token }),
      }),
    onSuccess: () => {
      toast.success("Fly token 已更新");
      setToken("");
      void client.invalidateQueries({ queryKey: ["config"] });
      void client.invalidateQueries({ queryKey: ["fly-apps"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const localVariables = useQuery({
    queryKey: ["fly-local-env", secretService],
    queryFn: () => api<LocalVariable[]>(`/api/fly/local-env/${secretService}`),
  });
  const flySecrets = useQuery({
    queryKey: ["fly-secrets", secretService],
    queryFn: async () =>
      normalizeFlySecrets(
        await api<unknown>(`/api/fly/apps/${secretService}/secrets`),
      ),
    enabled: !!configQuery.data?.secrets.flyToken.configured,
  });
  const applySecrets = useMutation({
    mutationFn: () =>
      api<Array<{ name: string; ok: boolean; error?: string }>>(
        `/api/fly/local-env/${secretService}/apply`,
        { method: "POST", ...jsonBody({ names: selectedVariables }) },
      ),
    onSuccess: (results) => {
      const failed = results.filter((item) => !item.ok);
      if (failed.length) toast.error(`${failed.length} 个变量同步失败`);
      else toast.success(`${results.length} 个 Fly secrets 已同步`);
      setSelectedVariables([]);
      void client.invalidateQueries({
        queryKey: ["fly-secrets", secretService],
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteSecret = useMutation({
    mutationFn: (name: string) =>
      api(
        `/api/fly/apps/${secretService}/secrets/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      toast.success("Fly secret 已删除");
      void client.invalidateQueries({
        queryKey: ["fly-secrets", secretService],
      });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div>
      <PageHeader
        eyebrow="Advanced operations"
        title="Fly.io management"
        description="查看各 API 应用状态，并从本地服务 .env 选择变量直接同步为 Fly secrets；页面永远看不到变量值。"
        actions={
          <Button variant="outline" onClick={() => void apps.refetch()}>
            <RefreshCw className={apps.isFetching ? "animate-spin" : ""} />{" "}
            Refresh apps
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg border bg-muted">
              <Cloud className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Fly API connection</h2>
              <p className="text-xs text-muted-foreground">
                Machines API endpoint and server-side bearer token.
              </p>
            </div>
          </div>
          {fly && (
            <FieldGroup className="mt-6">
              <Field>
                <FieldLabel htmlFor="fly-url">API base URL</FieldLabel>
                <Input
                  id="fly-url"
                  value={fly.apiBaseURL}
                  onChange={(e) =>
                    setFly({ ...fly, apiBaseURL: e.target.value })
                  }
                />
              </Field>
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="fly-token">Fly API token</FieldLabel>
                  <Badge
                    variant="outline"
                    className={
                      configQuery.data?.secrets.flyToken.configured
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : ""
                    }
                  >
                    {configQuery.data?.secrets.flyToken.configured
                      ? "Configured"
                      : "Not configured"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Input
                    id="fly-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste replacement token"
                    autoComplete="off"
                  />
                  <Button variant="outline" onClick={() => saveToken.mutate()}>
                    <KeyRound /> Update
                  </Button>
                </div>
              </Field>
              <Button onClick={() => saveConfig.mutate()}>
                <Save /> Save Fly config
              </Button>
            </FieldGroup>
          )}
        </section>
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Application registry</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              App names can be adjusted before querying Fly.
            </p>
          </div>
          {fly && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Fly app</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(fly.apps).map(([service, app]) => {
                  const state = apps.data?.find(
                    (item) => item.service === service,
                  );
                  return (
                    <TableRow key={service}>
                      <TableCell className="capitalize">
                        <Server className="mr-2 inline size-4 text-muted-foreground" />
                        {service}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={app}
                          onChange={(e) =>
                            setFly({
                              ...fly,
                              apps: { ...fly.apps, [service]: e.target.value },
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {state ? (
                          <StatusBadge ok={state.ok}>
                            {state.ok
                              ? "Reachable"
                              : (state.error ?? `HTTP ${state.status}`)}
                          </StatusBadge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Not checked
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
      <section className="mt-6 overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col justify-between gap-3 border-b px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold">Environment & secrets</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              从对应本地服务的 .env 选择变量名，BFF 直接将值同步到 Fly。
            </p>
          </div>
          <Select
            value={secretService}
            onValueChange={(value) => {
              setSecretService(value as keyof PublicConfig["fly"]["apps"]);
              setSelectedVariables([]);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fly &&
                Object.keys(fly.apps).map((service) => (
                  <SelectItem key={service} value={service}>
                    {service}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider">
                  Local .env names
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Values remain server-side.
                </p>
              </div>
              <Button
                size="sm"
                disabled={!selectedVariables.length || applySecrets.isPending}
                onClick={() => applySecrets.mutate()}
              >
                <UploadCloud /> Apply {selectedVariables.length || ""}
              </Button>
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {localVariables.data?.map((variable) => (
                <label
                  key={variable.name}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted"
                >
                  <span className="flex items-center gap-3 font-mono text-xs">
                    <Checkbox
                      checked={selectedVariables.includes(variable.name)}
                      disabled={!variable.configured}
                      onCheckedChange={(checked) =>
                        setSelectedVariables((current) =>
                          checked
                            ? [...current, variable.name]
                            : current.filter((name) => name !== variable.name),
                        )
                      }
                    />
                    {variable.name}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      variable.configured
                        ? "border-emerald-200 text-emerald-700 dark:border-emerald-500/35 dark:text-emerald-300"
                        : ""
                    }
                  >
                    {variable.configured ? "set" : "empty"}
                  </Badge>
                </label>
              ))}
              {localVariables.isError && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {localVariables.error.message}
                </p>
              )}
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider">
                  Fly secret names
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only names and digests are returned.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void flySecrets.refetch()}
              >
                <RefreshCw
                  className={flySecrets.isFetching ? "animate-spin" : ""}
                />{" "}
                Refresh
              </Button>
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {flySecrets.data?.map((secret) => (
                <div
                  key={secret.name}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted"
                >
                  <div>
                    <div className="font-mono text-xs">{secret.name}</div>
                    {secret.digest && (
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {secret.digest.slice(0, 16)}…
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${secret.name}`}
                    onClick={() =>
                      window.confirm(`Delete Fly secret ${secret.name}?`) &&
                      deleteSecret.mutate(secret.name)
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {!flySecrets.isLoading && !flySecrets.data?.length && (
                <p className="text-xs text-muted-foreground">
                  No Fly secrets returned.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
      <div className="mt-6 rounded-lg border border-dashed p-5">
        <div className="flex gap-3">
          <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <h3 className="text-sm font-semibold">Secret value isolation</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              浏览器只提交变量名；BFF 在服务目录读取值并直接调用 Fly
              API，响应也只保留状态。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeFlySecrets(input: unknown): FlySecret[] {
  if (Array.isArray(input)) return input as FlySecret[];
  if (input && typeof input === "object") {
    const value = (input as { secrets?: unknown }).secrets;
    if (Array.isArray(value)) return value as FlySecret[];
  }
  return [];
}
