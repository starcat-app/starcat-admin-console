/** Dataset Catalog 只读登记动作的共享确认对话框。 */
import { FileCheck2, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CatalogRegistrationAction =
  "lake.register-existing-watch-events" | "lake.register-existing-push-events";

/**
 * 两个 Catalog 页面必须复用同一段只读边界说明，避免用户把“重新登记快照”理解成
 * 移动或复制外接磁盘上的 Raw 文件。
 */
export function CatalogRegistrationDialog({
  actionId,
  running,
  onClose,
  onConfirm,
}: {
  actionId?: CatalogRegistrationAction;
  running: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={Boolean(actionId)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认登记既有 Raw Dataset</DialogTitle>
          <DialogDescription>
            将逐分区检查 Parquet footer、列结构、行数和 SHA-256。该动作只读，
            不会移动、复制或删除 T0 上的文件。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs">
          {actionId}
        </div>
        <DialogFooter showCloseButton>
          <Button onClick={onConfirm} disabled={running}>
            {running ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <FileCheck2 />
            )}
            Confirm inspection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
