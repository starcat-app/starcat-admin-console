import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Database,
  ExternalLink,
  ImageIcon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Rocket,
  Star,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EnvironmentMark, PageHeader } from "@/components/app-shell";
import { EmptyState, StatusBadge } from "@/components/status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useConsole } from "@/console-context";
import { api, jsonBody } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { AwesomeSource } from "@/types";

const emptySource: AwesomeSource = {
  id: "",
  repo_full_name: "",
  display_name: "",
  image_url: "",
  summary_zh: "",
  summary_en: "",
  featured: false,
  sort_order: 0,
};

export function AwesomePage() {
  const { environment, record } = useConsole();
  const client = useQueryClient();
  const [editing, setEditing] = useState<AwesomeSource | null>(null);
  const query = useQuery({
    queryKey: ["awesome", environment],
    queryFn: () =>
      api<AwesomeSource[]>(`/api/awesome/sources?environment=${environment}`),
  });

  const action = useMutation({
    mutationFn: ({
      source,
      name,
    }: {
      source: AwesomeSource;
      name: "sync" | "publish" | "archive";
    }) =>
      api(
        `/api/awesome/sources/${encodeURIComponent(source.id)}/${name}?environment=${environment}`,
        { method: "POST" },
      ),
    onSuccess: (_, variables) => {
      record({
        title: `Awesome ${variables.name}`,
        detail: variables.source.repo_full_name,
        outcome: "success",
      });
      toast.success(
        `${variables.source.display_name}: ${variables.name} 已提交`,
      );
      void client.invalidateQueries({ queryKey: ["awesome", environment] });
    },
    onError: (error) => toast.error(error.message),
  });

  const sources = Array.isArray(query.data) ? query.data : [];
  return (
    <div>
      <PageHeader
        eyebrow="Discover catalog"
        title="Awesome sources"
        description="只管理 Discover 的 Awesome 来源仓库与展示元数据；不会编辑或托管来源仓库内部 README。"
        actions={
          <>
            <EnvironmentMark />
            <Button onClick={() => setEditing({ ...emptySource })}>
              <Plus /> Add source
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          <Badge variant="secondary">{sources.length} sources</Badge>
          <Badge variant="outline">
            {sources.filter((item) => item.featured).length} featured
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? "animate-spin" : ""} />{" "}
          Refresh
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        {query.isError ? (
          <div className="p-5">
            <EmptyState
              icon={Database}
              title="无法读取 Awesome 来源"
              description={query.error.message}
            />
          </div>
        ) : !query.isLoading && !sources.length ? (
          <div className="p-5">
            <EmptyState
              icon={Database}
              title="No Awesome sources"
              description="当前环境尚未创建来源，或 Discovery Admin Key 还未配置。"
              action={
                <Button onClick={() => setEditing({ ...emptySource })}>
                  <Plus /> Add first source
                </Button>
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="font-medium">{source.display_name}</div>
                    <a
                      href={`https://github.com/${source.repo_full_name}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      {source.repo_full_name}
                      <ExternalLink className="size-3" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <Avatar className="size-9 rounded-md">
                      <AvatarImage src={source.image_url} alt="" />
                      <AvatarFallback className="rounded-md">
                        <ImageIcon className="size-4" />
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell>
                    <StatusBadge ok={source.status !== "archived"}>
                      {source.status ?? "Active"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {source.last_synced_at ? (
                      <span className="whitespace-nowrap text-sm tabular-nums">
                        <span className="font-mono font-medium text-foreground">
                          {source.github_repo_count ?? 0}
                        </span>{" "}
                        <span className="text-muted-foreground">repos</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {source.featured ? (
                      <Badge
                        className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-300"
                        variant="outline"
                      >
                        <Star className="size-3 fill-current" /> Featured
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {source.sort_order}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {relativeTime(source.last_synced_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${source.display_name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(source)}>
                          Edit metadata
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            action.mutate({ source, name: "sync" })
                          }
                        >
                          <RefreshCw /> Sync source
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            action.mutate({ source, name: "publish" })
                          }
                        >
                          <Rocket /> Publish
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            window.confirm(`Archive ${source.display_name}?`) &&
                            action.mutate({ source, name: "archive" })
                          }
                        >
                          <Archive /> Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <SourceEditor
        key={editing?.id ?? "new"}
        source={editing}
        environment={environment}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void client.invalidateQueries({ queryKey: ["awesome", environment] });
        }}
      />
    </div>
  );
}

function SourceEditor({
  source,
  environment,
  onOpenChange,
  onSaved,
}: {
  source: AwesomeSource | null;
  environment: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(source ?? emptySource);
  const editingExisting = source?.revision !== undefined;
  const save = useMutation({
    mutationFn: () =>
      api(
        `/api/awesome/sources${editingExisting ? `/${encodeURIComponent(form.id)}` : ""}?environment=${environment}`,
        { method: editingExisting ? "PATCH" : "POST", ...jsonBody(form) },
      ),
    onSuccess: () => {
      toast.success("Awesome source 已保存");
      onSaved();
    },
    onError: (error) => toast.error(error.message),
  });
  const update = <K extends keyof AwesomeSource>(
    key: K,
    value: AwesomeSource[K],
  ) => setForm((valueBefore) => ({ ...valueBefore, [key]: value }));
  return (
    <Sheet open={!!source} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {editingExisting ? "Edit Awesome source" : "Add Awesome source"}
          </SheetTitle>
          <SheetDescription>
            保存来源仓库和展示元数据。同步后由 Discovery 服务解析仓库内容。
          </SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-4 pb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="awesome-id">Stable ID</FieldLabel>
              <Input
                id="awesome-id"
                value={form.id}
                disabled={editingExisting}
                onChange={(e) => update("id", e.target.value)}
                placeholder="swift-awesome"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="awesome-repo">Repository</FieldLabel>
              <Input
                id="awesome-repo"
                value={form.repo_full_name}
                onChange={(e) => update("repo_full_name", e.target.value)}
                placeholder="owner/repo"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="awesome-name">Display name</FieldLabel>
            <Input
              id="awesome-name"
              value={form.display_name}
              onChange={(e) => update("display_name", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="awesome-image">Image URL</FieldLabel>
            <Input
              id="awesome-image"
              value={form.image_url}
              onChange={(e) => update("image_url", e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="awesome-summary-zh">中文简介</FieldLabel>
            <Textarea
              id="awesome-summary-zh"
              value={form.summary_zh}
              onChange={(e) => update("summary_zh", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="awesome-summary-en">
              English summary
            </FieldLabel>
            <Textarea
              id="awesome-summary-en"
              value={form.summary_en}
              onChange={(e) => update("summary_en", e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="awesome-order">Sort order</FieldLabel>
              <Input
                id="awesome-order"
                type="number"
                value={form.sort_order}
                onChange={(e) => update("sort_order", Number(e.target.value))}
              />
            </Field>
            <label className="flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm">
              <Checkbox
                checked={form.featured}
                onCheckedChange={(checked) =>
                  update("featured", checked === true)
                }
              />{" "}
              Featured source
            </label>
          </div>
        </FieldGroup>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !form.id ||
              !form.repo_full_name ||
              !form.display_name ||
              save.isPending
            }
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save source"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
