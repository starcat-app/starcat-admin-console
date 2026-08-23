import { Activity, CheckCircle2, CircleX, Clock3 } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConsole } from "@/console-context";
import { relativeTime } from "@/lib/format";

export function ActivityPage() {
  const { activity } = useConsole();
  return (
    <div>
      <PageHeader
        eyebrow="Session audit"
        title="Jobs & activity"
        description="展示当前控制台会话触发的已脱敏操作记录；不存储请求密钥与响应正文。"
      />
      <div className="overflow-hidden rounded-lg border bg-card">
        {activity.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outcome</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.outcome === "success" ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : entry.outcome === "failed" ? (
                      <CircleX className="size-4 text-red-600" />
                    ) : (
                      <Clock3 className="size-4 text-blue-600" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{entry.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {entry.environment}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-lg truncate text-sm text-muted-foreground">
                    {entry.detail}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {relativeTime(entry.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-5">
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="本会话执行的服务动作、Agent 识别和发布操作会出现在这里。刷新页面后记录会清空。"
            />
          </div>
        )}
      </div>
    </div>
  );
}
