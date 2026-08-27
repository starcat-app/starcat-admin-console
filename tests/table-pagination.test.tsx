import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  clampPage,
  getPageCount,
  paginateItems,
  TablePagination,
} from "@/components/table-pagination";

describe("TablePagination", () => {
  it("calculates safe page boundaries and slices client-side rows", () => {
    expect(getPageCount(21, 10)).toBe(3);
    expect(clampPage(9, 21, 10)).toBe(3);
    expect(paginateItems([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });

  it("renders the visible range and emits the next page", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <TablePagination
        page={2}
        pageSize={10}
        totalItems={25}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText("Showing 11–20 of 25")).toBeInTheDocument();
    expect(screen.getByText("Page 2 / 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("does not add pagination chrome for a single page", () => {
    const { container } = render(
      <TablePagination
        page={1}
        pageSize={10}
        totalItems={10}
        onPageChange={() => undefined}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
