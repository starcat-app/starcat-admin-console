import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  CircleCheck,
  CircleX,
  EyeOff,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Save,
  ServerCog,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EnvironmentMark, PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useConsole } from "@/console-context";
import { api, jsonBody } from "@/lib/api";
import type {
  AgentRuntimeId,
  LocalAgentStatus,
  PublicConfig,
  SecretKind,
  ServiceId,
} from "@/types";
import { serviceIds } from "@/types";

const adminServiceIds = ["weekly", "discovery"] as const satisfies ServiceId[];

type SecretTarget =
  | { scope: "shared" }
  | { scope: "service"; service: ServiceId; kind: SecretKind };

function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => api<PublicConfig>("/api/config"),
  });
}

export function ProfilesPage() {
  const { environment } = useConsole();
  const query = useConfig();
  const client = useQueryClient();
  const profile = query.data?.profiles[environment];
  const [drafts, setDrafts] = useState<
    Partial<Record<"test" | "production", PublicConfig["profiles"]["test"]>>
  >({});
  const draft = drafts[environment] ?? profile;
  const setDraft = (next: PublicConfig["profiles"]["test"]) =>
    setDrafts((current) => ({ ...current, [environment]: next }));
  const [secretTarget, setSecretTarget] = useState<SecretTarget | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api<PublicConfig>(`/api/config/profiles/${environment}`, {
        method: "PUT",
        ...jsonBody(draft),
      }),
    onSuccess: () => {
      toast.success(`${environment} profile 已保存`);
      void client.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Connection settings"
        title="Environment profiles"
        description="测试环境默认直连本机多个独立服务；生产环境默认通过 Starcat API gateway 路由。"
        actions={
          <>
            <EnvironmentMark />
            <Button
              disabled={!draft || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save /> Save profile
            </Button>
          </>
        }
      />
      <div className="rounded-lg border bg-card">
        <div className="border-b p-5">
          <h2 className="text-sm font-semibold capitalize">
            {environment} connection profile
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            切换顶栏环境后编辑对应配置。所有 URL 均由 BFF 校验和使用。
          </p>
        </div>
        {draft && (
          <div className="p-5">
            {environment === "production" ? (
              <ProductionProfile
                draft={draft}
                setDraft={setDraft}
                config={query.data!}
                setSecretTarget={setSecretTarget}
              />
            ) : (
              <TestProfile
                draft={draft}
                setDraft={setDraft}
                config={query.data!}
                setSecretTarget={setSecretTarget}
              />
            )}
          </div>
        )}
      </div>
      <SecretDialog
        target={secretTarget}
        environment={environment}
        onOpenChange={(open) => !open && setSecretTarget(null)}
        onSaved={() => {
          setSecretTarget(null);
          void client.invalidateQueries({ queryKey: ["config"] });
        }}
      />
    </div>
  );
}

function ProductionProfile({
  draft,
  setDraft,
  config,
  setSecretTarget,
}: {
  draft: PublicConfig["profiles"]["production"];
  setDraft: (next: PublicConfig["profiles"]["production"]) => void;
  config: PublicConfig;
  setSecretTarget: (target: SecretTarget) => void;
}) {
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Field>
          <FieldLabel htmlFor="gateway-url">Gateway URL</FieldLabel>
          <Input
            id="gateway-url"
            value={draft.gatewayURL}
            onChange={(event) =>
              setDraft({ ...draft, gatewayURL: event.target.value })
            }
            placeholder="https://starcat-api.fly.dev"
          />
          <FieldDescription>
            六个开源服务统一通过 gateway + <code>X-SC-Svc</code> 路由。
          </FieldDescription>
        </Field>
        <div className="rounded-lg border bg-muted/25 p-4">
          <div className="mb-3">
            <div className="text-sm font-medium">Shared API key</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Gateway 的六个服务共用一把 API Key。
            </p>
          </div>
          <SecretButton
            label="Shared API"
            configured={config.secrets.productionSharedApiKey.configured}
            onClick={() => setSecretTarget({ scope: "shared" })}
          />
        </div>
      </div>
      <Separator className="my-6" />
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Privileged credentials</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            只有 Weekly 与 Discovery 的管理接口使用独立 Admin Key。
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border">
          {adminServiceIds.map((service) => {
            const secret = config.secrets.profiles.production[service];
            return (
              <div
                key={service}
                className="flex flex-col justify-between gap-3 border-b px-4 py-4 last:border-b-0 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="text-sm font-medium capitalize">
                    {service}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Internal write operations
                  </div>
                </div>
                <div className="w-full sm:w-36">
                  <SecretButton
                    label="Admin"
                    configured={secret.adminKey.configured}
                    onClick={() =>
                      setSecretTarget({
                        scope: "service",
                        service,
                        kind: "adminKey",
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function TestProfile({
  draft,
  setDraft,
  config,
  setSecretTarget,
}: {
  draft: PublicConfig["profiles"]["test"];
  setDraft: (next: PublicConfig["profiles"]["test"]) => void;
  config: PublicConfig;
  setSecretTarget: (target: SecretTarget) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-[150px_minmax(220px,1fr)_180px] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>Service</span>
        <span>Local Base URL</span>
        <span>Credentials</span>
      </div>
      {serviceIds.map((service) => {
        const secret = config.secrets.profiles.test[service];
        const supportsAdmin = adminServiceIds.includes(
          service as (typeof adminServiceIds)[number],
        );
        return (
          <div
            key={service}
            className="grid grid-cols-1 gap-3 border-b px-4 py-4 last:border-b-0 md:grid-cols-[150px_minmax(220px,1fr)_180px] md:items-center"
          >
            <div>
              <div className="text-sm font-medium capitalize">{service}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                Direct local service
              </div>
            </div>
            <Input
              aria-label={`${service} base URL`}
              value={draft.services[service].baseURL}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  services: {
                    ...draft.services,
                    [service]: { baseURL: event.target.value },
                  },
                })
              }
            />
            <div className="flex gap-2">
              <SecretButton
                label="API"
                configured={secret.apiKey.configured}
                onClick={() =>
                  setSecretTarget({
                    scope: "service",
                    service,
                    kind: "apiKey",
                  })
                }
              />
              {supportsAdmin && (
                <SecretButton
                  label="Admin"
                  configured={secret.adminKey.configured}
                  onClick={() =>
                    setSecretTarget({
                      scope: "service",
                      service,
                      kind: "adminKey",
                    })
                  }
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SecretButton({
  label,
  configured,
  onClick,
}: {
  label: string;
  configured: boolean;
  onClick: () => void;
}) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} className="flex-1">
      <KeyRound className="size-3.5" /> {label}
      <span
        className={
          configured
            ? "size-1.5 rounded-full bg-emerald-500"
            : "size-1.5 rounded-full bg-muted-foreground/30"
        }
      />
    </Button>
  );
}

function SecretDialog({
  target,
  environment,
  onOpenChange,
  onSaved,
}: {
  target: SecretTarget | null;
  environment: "test" | "production";
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const endpoint =
    target?.scope === "shared"
      ? "/api/config/profiles/production/secrets/sharedApiKey"
      : target
        ? `/api/config/profiles/${environment}/${target.service}/secrets/${target.kind}`
        : "";
  const title =
    target?.scope === "shared"
      ? "Update shared API key"
      : `Update ${target?.kind}`;
  const scope =
    target?.scope === "shared"
      ? "production gateway"
      : `${environment} / ${target?.service}`;
  const save = useMutation({
    mutationFn: () => api(endpoint, { method: "PUT", ...jsonBody({ value }) }),
    onSuccess: () => {
      toast.success("密钥状态已更新");
      setValue("");
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            为 {scope}{" "}
            设置新值。保存后页面只能看到状态与不可逆指纹，无法读回原文。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <EyeOff className="mr-2 inline size-4" />
          输入内容仅发送给本地 BFF，并写入权限为 0600 的 secrets 文件。
        </div>
        <Input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste new value; empty removes it"
          autoComplete="off"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <LockKeyhole /> Save secret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AgentSettingsPage() {
  const query = useConfig();
  const client = useQueryClient();
  const [agentDraft, setAgentDraft] = useState<Partial<PublicConfig["agent"]>>(
    {},
  );
  const agent = query.data ? { ...query.data.agent, ...agentDraft } : undefined;
  const setAgent = (next: PublicConfig["agent"]) => setAgentDraft(next);
  const [agentKey, setAgentKey] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const runtimes = useQuery({
    queryKey: ["agent-runtimes"],
    queryFn: () => api<LocalAgentStatus[]>("/api/config/agent/runtimes"),
  });
  const runtimeStatus = runtimes.data?.find(
    (item) => item.runtime === agent?.runtime,
  );
  const saveAgent = useMutation({
    mutationFn: () =>
      api("/api/config/agent", { method: "PUT", ...jsonBody(agent) }),
    onSuccess: () => {
      toast.success("Agent 配置已保存");
      setAgentDraft({});
      void client.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const saveSecret = useMutation({
    mutationFn: ({
      kind,
      value,
    }: {
      kind: "agentApiKey" | "githubToken";
      value: string;
    }) =>
      api(`/api/config/secrets/${kind}`, {
        method: "PUT",
        ...jsonBody({ value }),
      }),
    onSuccess: (_, variables) => {
      toast.success(`${variables.kind} 已更新`);
      setAgentKey("");
      setGithubToken("");
      void client.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const testAgent = useMutation({
    mutationFn: (runtime: "codex" | "claude") =>
      api<{ runtime: string; ok: true }>("/api/config/agent/test", {
        method: "POST",
        ...jsonBody({ runtime }),
      }),
    onSuccess: (_, runtime) =>
      toast.success(
        `${runtime === "codex" ? "Codex CLI" : "Claude Code"} 连接正常`,
      ),
    onError: (error) => toast.error(error.message),
  });
  const isLocalRuntime =
    agent?.runtime === "codex" || agent?.runtime === "claude";
  return (
    <div>
      <PageHeader
        eyebrow="Agent runtime"
        title="Agent & verification"
        description="优先复用本机已登录的 Codex CLI 或 Claude Code；Agent 负责联网甄别，GitHub API 负责最终核验。"
        actions={
          <Button
            disabled={!agent || saveAgent.isPending}
            onClick={() => saveAgent.mutate()}
          >
            <Save /> Save agent
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg border bg-muted">
              <Bot className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Agent runtime</h2>
              <p className="text-xs text-muted-foreground">
                本机 CLI 不需要在 Console 中重复填写模型服务商。
              </p>
            </div>
          </div>
          {agent && (
            <FieldGroup className="mt-6">
              <Field>
                <FieldLabel htmlFor="agent-runtime">Runtime</FieldLabel>
                <Select
                  value={agent.runtime}
                  onValueChange={(value) =>
                    setAgent({ ...agent, runtime: value as AgentRuntimeId })
                  }
                >
                  <SelectTrigger id="agent-runtime" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="codex">Codex CLI</SelectItem>
                    <SelectItem value="claude">Claude Code</SelectItem>
                    <SelectItem value="openai-compatible">
                      OpenAI-compatible（兼容模式）
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  默认使用 CLI 自己保存的登录状态和模型配置。
                </FieldDescription>
              </Field>
              {isLocalRuntime ? (
                <div className="rounded-md border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-md border bg-background">
                      <Terminal className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {agent.runtime === "codex"
                            ? "Codex CLI"
                            : "Claude Code"}
                        </span>
                        {runtimes.isLoading ? (
                          <Badge variant="outline">
                            <LoaderCircle className="animate-spin" /> 检测中
                          </Badge>
                        ) : runtimeStatus?.available ? (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <CircleCheck /> 已安装
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <CircleX /> 不可用
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {runtimeStatus?.command ?? agent.runtime}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {runtimeStatus?.version ??
                          runtimeStatus?.error ??
                          "等待检测本机 CLI"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={runtimes.isFetching}
                      onClick={() => void runtimes.refetch()}
                    >
                      <RefreshCw
                        className={runtimes.isFetching ? "animate-spin" : ""}
                      />
                      重新检测
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        !runtimeStatus?.available || testAgent.isPending
                      }
                      onClick={() =>
                        testAgent.mutate(agent.runtime as "codex" | "claude")
                      }
                    >
                      {testAgent.isPending ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <FlaskConical />
                      )}
                      测试 Agent
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="agent-url">Base URL</FieldLabel>
                    <Input
                      id="agent-url"
                      value={agent.baseURL}
                      onChange={(e) =>
                        setAgent({ ...agent, baseURL: e.target.value })
                      }
                      placeholder="https://api.openai.com/v1"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="agent-model">Model</FieldLabel>
                    <Input
                      id="agent-model"
                      value={agent.model}
                      onChange={(e) =>
                        setAgent({ ...agent, model: e.target.value })
                      }
                      placeholder="gpt-5-mini"
                    />
                  </Field>
                </>
              )}
            </FieldGroup>
          )}
        </section>
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold">Server-side credentials</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            GitHub Token 用于提高 API 核验限额；模型密钥仅供兼容模式使用。
          </p>
          <FieldGroup className="mt-6">
            {!isLocalRuntime && (
              <SecretField
                id="agent-key"
                label="Agent API key"
                state={query.data?.secrets.agentApiKey.configured}
                value={agentKey}
                setValue={setAgentKey}
                onSave={() =>
                  saveSecret.mutate({ kind: "agentApiKey", value: agentKey })
                }
              />
            )}
            <SecretField
              id="github-token"
              label="GitHub token"
              state={query.data?.secrets.githubToken.configured}
              value={githubToken}
              setValue={setGithubToken}
              onSave={() =>
                saveSecret.mutate({ kind: "githubToken", value: githubToken })
              }
            />
          </FieldGroup>
        </section>
      </div>
      <div className="mt-6 rounded-lg border bg-muted/25 p-5">
        <h3 className="text-sm font-semibold">Security boundary</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Boundary icon={Bot} title="Agent" text="只看原始线索并联网甄别" />
          <Boundary
            icon={ServerCog}
            title="BFF"
            text="复核 GitHub 仓库并隔离服务密钥"
          />
          <Boundary
            icon={KeyRound}
            title="Publisher"
            text="发布路由才注入 Weekly Key"
          />
        </div>
      </div>
    </div>
  );
}

function SecretField({
  id,
  label,
  state,
  value,
  setValue,
  onSave,
}: {
  id: string;
  label: string;
  state?: boolean;
  value: string;
  setValue: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Badge
          variant="outline"
          className={
            state
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300"
              : ""
          }
        >
          {state ? (
            <>
              <Check /> Configured
            </>
          ) : (
            "Not configured"
          )}
        </Badge>
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          placeholder="Paste replacement value"
        />
        <Button variant="outline" onClick={onSave}>
          Update
        </Button>
      </div>
    </Field>
  );
}

function Boundary({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{text}</div>
      </div>
    </div>
  );
}
