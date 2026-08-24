import { describe, expect, it } from "vitest";

import {
  credentialKindsForService,
  pickValue,
  serviceRegistry,
} from "./service-registry.js";

describe("service registry", () => {
  it("contains only the six open-source business services", () => {
    expect(Object.keys(serviceRegistry)).toEqual([
      "sharing",
      "trending",
      "weekly",
      "wiki",
      "recommend",
      "discovery",
    ]);
  });

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

  it("matches the real credential capability matrix", () => {
    expect(
      Object.fromEntries(
        Object.keys(serviceRegistry).map((service) => [
          service,
          credentialKindsForService(service as keyof typeof serviceRegistry),
        ]),
      ),
    ).toEqual({
      sharing: ["apiKey"],
      trending: ["apiKey"],
      weekly: ["apiKey", "adminKey"],
      wiki: ["apiKey"],
      recommend: ["apiKey"],
      discovery: ["apiKey", "adminKey"],
    });
    expect(
      serviceRegistry.wiki.actions.every((action) => action.auth === "apiKey"),
    ).toBe(true);
  });
});
