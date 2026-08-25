import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Code2,
  ExternalLink,
  LoaderCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EnvironmentMark, PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useConsole } from "@/console-context";
import { api, jsonBody } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ImportFinding } from "@/types";

interface IdentificationResult {
  identificationID: string;
  findings: ImportFinding[];
}

interface ImportBatch {
  batch_id: string;
  status: "pending" | "processing" | "success" | "partial_success" | "failed";
  total: number;
  success: number;
  discarded: number;
}

export function ImportsPage() {
  const { environment, record } = useConsole();
  const [text, setText] = useState("");
  const [sourceCode, setSourceCode] = useState("ai_intelligence");
  const [findings, setFindings] = useState<ImportFinding[]>([]);
  const [published, setPublished] = useState<{
    idempotencyKey: string;
    batchId?: string;
  } | null>(null);

  const identify = useMutation({
    mutationFn: () =>
      api<IdentificationResult>("/api/imports/identify", {
        method: "POST",
        ...jsonBody({ text }),
      }),
    onSuccess: (data) => {
      setFindings(data.findings);
      setPublished(null);
      record({
        title: "Agent identification",
        detail: `${data.findings.length} 条线索完成核验`,
        outcome: "success",
      });
      toast.success(`完成 ${data.findings.length} 条线索识别`);
    },
    onError: (error) => {
      record({
        title: "Agent identification",
        detail: error.message,
        outcome: "failed",
      });
      toast.error(error.message);
    },
  });

  const selected = useMemo(
    () => findings.filter((item) => item.selected && item.repository),
    [findings],
  );
  const publish = useMutation({
    mutationFn: () =>
      api<{ upstream: unknown; idempotencyKey: string }>(
        "/api/imports/publish",
        {
          method: "POST",
          ...jsonBody({
            environment,
            sourceCode,
            repositories: selected.map((item) => ({
              repository: item.repository,
              title: item.title,
              sourceURL: item.candidate?.htmlURL,
            })),
          }),
        },
      ),
    onSuccess: (data) => {
      const acceptance = data.upstream as { batch_id?: string };
      setPublished({
        idempotencyKey: data.idempotencyKey,
        batchId: acceptance.batch_id,
      });
      record({
        title: "Curated publish",
        detail: `${selected.length} 个仓库 → Weekly`,
        outcome: "success",
      });
      toast.success("精选导入已提交");
    },
    onError: (error) => {
      record({
        title: "Curated publish",
        detail: error.message,
        outcome: "failed",
      });
      toast.error(error.message);
    },
  });
  const batch = useQuery({
    queryKey: ["import-batch", environment, published?.batchId],
    queryFn: () =>
      api<ImportBatch>(
        `/api/imports/batches/${published!.batchId}?environment=${environment}`,
      ),
    enabled: !!published?.batchId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ["success", "partial_success", "failed"].includes(status)
        ? false
        : 2_000;
    },
  });

  const toggle = (id: string, checked: boolean) =>
    setFindings((current) =>
      current.map((item) =>
        item.id === id ? { ...item, selected: checked } : item,
      ),
    );

  return (
    <div>
      <PageHeader
        eyebrow="Agent-assisted workflow"
        title="Curated imports"
        description="粘贴自然语言、链接或混合清单；Agent 会拆分线索并联网核验 GitHub 证据，人工复核后才发布到 Weekly。"
        actions={<EnvironmentMark />}
      />

      <div className="mb-8 grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3">
        <WorkflowStep
          number="01"
          title="Collect clues"
          description="接收未经结构化的原始文本"
          active={!findings.length}
          complete={!!findings.length}
        />
        <WorkflowStep
          number="02"
          title="Verify evidence"
          description="Agent 判断 + GitHub 网络核验"
          active={!!findings.length && !published}
          complete={!!published}
        />
        <WorkflowStep
          number="03"
          title="Review & publish"
          description="人工选中后显式发布"
          active={!!published}
          complete={!!published}
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(340px,0.72fr)_minmax(0,1.28fr)]">
        <section className="rounded-lg border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Input evidence</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                支持微博文案、项目名、GitHub URL 与混合清单。
              </p>
            </div>
            <Badge variant="outline">
              <Bot className="size-3" /> Agent
            </Badge>
          </div>
          <Textarea
            className="mt-5 min-h-[360px] resize-y font-mono text-xs leading-5"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              "示例：\n1. 一个本地优先的 AI 知识库项目 ...\n2. https://github.com/owner/repo\n3. 微博里提到的几款开发工具 ..."
            }
          />
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{text.length.toLocaleString()} / 100,000 chars</span>
            <span>Maximum 200 clues</span>
          </div>
          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={!text.trim() || identify.isPending}
            onClick={() => identify.mutate()}
          >
            {identify.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Search />
            )}
            {identify.isPending
              ? "Agent 正在联网甄别并核验…"
              : "Identify & verify projects"}
          </Button>
          {identify.isPending && (
            <div className="mt-4">
              <Progress value={66} className="h-1" />
              <p className="mt-2 text-xs text-muted-foreground">
                识别会调用当前 Agent 与 GitHub API，耗时取决于线索数量。
              </p>
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-lg border bg-card">
          <div className="flex flex-col justify-between gap-3 border-b px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold">Verification review</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Agent 返回的仓库只有通过 GitHub API 复核后才能选中。
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{findings.length} clues</Badge>
              <Badge variant="secondary">{selected.length} selected</Badge>
            </div>
          </div>
          {!findings.length ? (
            <div className="p-5">
              <EmptyState
                icon={Sparkles}
                title="No identification result"
                description="在左侧粘贴项目线索并运行 Agent。核验结果会在这里逐条展示，发布前可以取消选择。"
              />
            </div>
          ) : (
            <div className="max-h-[620px] divide-y overflow-y-auto">
              {findings.map((finding) => (
                <div key={finding.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={finding.selected}
                      disabled={!finding.repository}
                      onCheckedChange={(checked) =>
                        toggle(finding.id, checked === true)
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FindingBadge status={finding.status} />
                        <span className="text-xs font-medium text-muted-foreground">
                          {Math.round(finding.confidence * 100)}% confidence
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {finding.repository ??
                          finding.title ??
                          finding.original}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {finding.reason}
                      </p>
                      {finding.candidate && (
                        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                          <Code2 className="size-3.5" />
                          <a
                            className="font-medium hover:underline"
                            href={finding.candidate.htmlURL}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {finding.candidate.fullName}{" "}
                            <ExternalLink className="ml-1 inline size-3" />
                          </a>
                          <span className="text-muted-foreground">
                            ★ {finding.candidate.stars.toLocaleString()}
                          </span>
                          <span className="text-muted-foreground">
                            {finding.candidate.language ?? "Unknown"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!!findings.length && (
            <div className="border-t p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-xs font-medium" htmlFor="source-code">
                    Source code
                  </label>
                  <Input
                    id="source-code"
                    className="mt-1.5"
                    value={sourceCode}
                    onChange={(event) => setSourceCode(event.target.value)}
                  />
                </div>
                <Button
                  size="lg"
                  disabled={!selected.length || publish.isPending}
                  onClick={() => publish.mutate()}
                >
                  <Send />{" "}
                  {publish.isPending
                    ? "Publishing…"
                    : `Publish ${selected.length} projects`}
                </Button>
              </div>
              {environment === "production" && (
                <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100">
                  <ShieldCheck />
                  <AlertTitle>Direct production write</AlertTitle>
                  <AlertDescription>
                    确认后会直接写入线上 Weekly 服务；相同 payload 会复用稳定
                    idempotency key。
                  </AlertDescription>
                </Alert>
              )}
              {published && (
                <Alert className="mt-4 border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-100">
                  <CheckCircle2 />
                  <AlertTitle>
                    Batch {batch.data?.status ?? "submitted"}
                  </AlertTitle>
                  <AlertDescription>
                    <span className="break-all">
                      Idempotency: {published.idempotencyKey}
                    </span>
                    {batch.data && (
                      <span className="mt-1 block">
                        {batch.data.success} success · {batch.data.discarded}{" "}
                        discarded · {batch.data.total} total
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  description,
  active,
  complete,
}: {
  number: string;
  title: string;
  description: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div
      className={cn("bg-card p-4", active && "bg-foreground text-background")}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "font-mono text-xs",
            active ? "text-background/60" : "text-muted-foreground",
          )}
        >
          {complete ? "✓" : number}
        </span>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div
            className={cn(
              "mt-1 text-xs",
              active ? "text-background/65" : "text-muted-foreground",
            )}
          >
            {description}
          </div>
        </div>
      </div>
    </div>
  );
}

function FindingBadge({ status }: { status: ImportFinding["status"] }) {
  const config =
    status === "confirmed"
      ? [
          "Confirmed",
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300",
        ]
      : status === "needs_review"
        ? [
            "Needs review",
            "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-300",
          ]
        : [
            "Not found",
            "border-red-200 bg-red-50 text-red-700 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-300",
          ];
  return (
    <Badge variant="outline" className={config[1]}>
      {status === "confirmed" && <CheckCircle2 className="size-3" />}
      {config[0]}
    </Badge>
  );
}
