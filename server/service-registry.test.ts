import { describe, expect, it } from "vitest";

import { pickValue, serviceRegistry } from "./service-registry.js";

describe("service registry", () => {
  it("resolves nested and selected statistic values", () => {
    const body = {
      data: { modes: [{ mode: "popular", total: 42 }], repos: { total: 9 } },
    };
    expect(pickValue(body, "data.repos.total")).toBe(9);
    expect(pickValue(body, "data.modes[mode=popular].total")).toBe(42);
    expect(pickValue(body, "data.modes[mode=missing].total")).toBeUndefined();
  });

  it("keeps destructive actions explicitly marked", () => {
    expect(
      serviceRegistry.weekly.actions.find((action) => action.id === "rebuild")
        ?.destructive,
    ).toBe(true);
    expect(
      serviceRegistry.discovery.actions.find(
        (action) => action.id === "sync-incremental",
      )?.destructive,
    ).toBe(false);
  });

  it("declares required payload fields for scoped actions", () => {
    expect(
      serviceRegistry.wiki.actions.find(
        (action) => action.id === "refresh-owner",
      )?.fields,
    ).toEqual([expect.objectContaining({ name: "owner", required: true })]);
  });
});
