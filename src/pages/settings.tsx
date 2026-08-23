import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Save,
  ServerCog,
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
import { Separator } from "@/components/ui/separator";
import { useConsole } from "@/console-context";
import { api, jsonBody } from "@/lib/api";
import type { PublicConfig, ServiceId } from "@/types";
import { serviceIds } from "@/types";

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
  const [secretTarget, setSecretTarget] = useState<{
    service: ServiceId;
    kind: "apiKey" | "adminKey";
  } | null>(null);

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
            <Field>
              <FieldLabel htmlFor="gateway-url">Gateway URL</FieldLabel>
              <Input
                id="gateway-url"
                value={draft.gatewayURL}
                onChange={(event) =>
                  setDraft({ ...draft, gatewayURL: event.target.value })
                }
                placeholder={
                  environment === "test"
                    ? "测试环境可留空"
                    : "https://starcat-api.fly.dev"
                }
              />
              <FieldDescription>
                生产业务服务通过 gateway + <code>X-SC-Svc</code> 路由；License
                使用独立地址。
              </FieldDescription>
            </Field>
            <Separator className="my-6" />
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[150px_minmax(220px,1fr)_180px] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span>Service</span>
                <span>Base URL</span>
                <span>Credentials</span>
              </div>
              {serviceIds.map((service) => {
                const secret =
                  query.data!.secrets.profiles[environment][service];
                return (
                  <div
                    key={service}
                    className="grid grid-cols-1 gap-3 border-b px-4 py-4 last:border-b-0 md:grid-cols-[150px_minmax(220px,1fr)_180px] md:items-center"
                  >
                    <div>
                      <div className="text-sm font-medium capitalize">
                        {service}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        X-SC-Svc: {service}
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
                          setSecretTarget({ service, kind: "apiKey" })
                        }
                      />
                      <SecretButton
                        label="Admin"
                        configured={secret.adminKey.configured}
                        onClick={() =>
                          setSecretTarget({ service, kind: "adminKey" })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
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
  target: { service: ServiceId; kind: "apiKey" | "adminKey" } | null;
  environment: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api(
        `/api/config/profiles/${environment}/${target!.service}/secrets/${target!.kind}`,
        { method: "PUT", ...jsonBody({ value }) },
      ),
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
          <DialogTitle>Update {target?.kind}</DialogTitle>
          <DialogDescription>
            为 {environment} / {target?.service}{" "}
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
  const saveAgent = useMutation({
    mutationFn: () =>
      api("/api/config/agent", { method: "PUT", ...jsonBody(agent) }),
    onSuccess: () => {
      toast.success("Agent 配置已保存");
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
  return (
    <div>
      <PageHeader
        eyebrow="Agent provider"
        title="Agent & verification"
        description="配置 OpenAI-compatible 模型服务与 GitHub 网络核验凭证。识别阶段永远拿不到 Weekly Admin Key。"
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
              <h2 className="text-sm font-semibold">Model endpoint</h2>
              <p className="text-xs text-muted-foreground">
                用于拆分线索与基于已核验候选做判断。
              </p>
            </div>
          </div>
          {agent && (
            <FieldGroup className="mt-6">
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
            </FieldGroup>
          )}
        </section>
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold">Server-side credentials</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            新值不会回显。留空并保存会删除现有凭证。
          </p>
          <FieldGroup className="mt-6">
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
          <Boundary icon={Bot} title="Agent" text="只看线索与核验候选" />
          <Boundary
            icon={ServerCog}
            title="BFF"
            text="持有模型与 GitHub 凭证"
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
            state ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""
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
