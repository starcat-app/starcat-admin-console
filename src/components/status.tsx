import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({
  ok,
  pending,
  children,
}: {
  ok?: boolean;
  pending?: boolean;
  children: React.ReactNode;
}) {
  const Icon = pending ? LoaderCircle : ok ? CheckCircle2 : AlertCircle;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium",
        pending
          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/35 dark:bg-blue-500/10 dark:text-blue-300"
          : ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-300",
      )}
    >
      <Icon className={cn("size-3", pending && "animate-spin")} /> {children}
    </Badge>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-10 place-items-center rounded-lg border bg-background text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
