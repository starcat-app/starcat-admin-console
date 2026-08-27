/**
 * 长列表共用的紧凑分页栏与分页计算工具。
 *
 * 页面数据可能来自服务端 offset，也可能已经完整加载到浏览器，因此组件只负责
 * 展示分页状态并发出页码变化；数据切片仍由各页面按自身数据边界处理。
 */
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const DEFAULT_TABLE_PAGE_SIZE = 10;

export function getPageCount(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function clampPage(page: number, totalItems: number, pageSize: number) {
  return Math.min(Math.max(page, 1), getPageCount(totalItems, pageSize));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePage = clampPage(page, items.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

interface TablePaginationProps {
  page: number;
  pageSize?: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * 使用受控页码，确保服务端分页和客户端分页共享同一套视觉与边界语义。
 */
export function TablePagination({
  page,
  pageSize = DEFAULT_TABLE_PAGE_SIZE,
  totalItems,
  onPageChange,
  className,
}: TablePaginationProps) {
  const totalPages = getPageCount(totalItems, pageSize);
  const safePage = clampPage(page, totalItems, pageSize);
  const firstItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastItem = Math.min(safePage * pageSize, totalItems);

  if (totalItems <= pageSize) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>
        Showing {firstItem.toLocaleString()}–{lastItem.toLocaleString()} of{" "}
        {totalItems.toLocaleString()}
      </span>
      <div className="flex items-center gap-3">
        <span className="font-mono">
          Page {safePage.toLocaleString()} / {totalPages.toLocaleString()}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            <ChevronLeft /> Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
