import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useConsole } from "@/console-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, jsonBody } from "@/lib/api";
import type { ServiceAction, ServiceId } from "@/types";

export function ServiceActionButton({
  service,
  action,
  size = "sm",
}: {
  service: ServiceId;
  action: ServiceAction;
  size?: "sm" | "default";
}) {
  const [confirming, setConfirming] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const { environment, record } = useConsole();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api(
        `/api/services/${service}/actions/${action.id}?environment=${environment}`,
        {
          method: "POST",
          ...(action.fields?.length ? jsonBody(values) : {}),
        },
      ),
    onSuccess: () => {
      record({
        title: action.label,
        detail: `${service} · ${action.path}`,
        outcome: "success",
      });
      toast.success(`${action.label} 已提交`);
      void queryClient.invalidateQueries({
        queryKey: ["services", environment],
      });
      setConfirming(false);
    },
    onError: (error) => {
      record({ title: action.label, detail: error.message, outcome: "failed" });
      toast.error(error.message);
    },
  });

  const execute = () =>
    action.destructive || action.fields?.length
      ? setConfirming(true)
      : mutation.mutate();
  const invalid = action.fields?.some(
    (field) => field.required && !values[field.name]?.trim(),
  );

  return (
    <>
      <Button
        size={size}
        variant={action.destructive ? "outline" : "default"}
        onClick={execute}
        disabled={mutation.isPending}
      >
        {action.destructive ? <TriangleAlert /> : <Play />}
        {mutation.isPending ? "Running…" : action.label}
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认执行「{action.label}」？</DialogTitle>
            <DialogDescription>
              将在 <strong>{environment}</strong> 环境调用{" "}
              <code>{action.path}</code>。此动作可能重建、覆盖或清理已有数据。
            </DialogDescription>
          </DialogHeader>
          {!!action.fields?.length && (
            <div className="space-y-4">
              {action.fields.map((field) => (
                <Field key={field.name}>
                  <FieldLabel htmlFor={`${action.id}-${field.name}`}>
                    {field.label}
                  </FieldLabel>
                  <Input
                    id={`${action.id}-${field.name}`}
                    value={values[field.name] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.name]: event.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button
              variant={action.destructive ? "destructive" : "default"}
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || invalid}
            >
              {mutation.isPending ? "执行中…" : "确认执行"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
