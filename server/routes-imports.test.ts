import { describe, expect, it } from "vitest";

import type { ConfigStore } from "./config-store.js";
import type { UpstreamRequest } from "./upstream.js";
import {
  createImportRoutes,
  stableIdempotencyKey,
  type GitHubCandidate,
} from "./routes-imports.js";

describe("stableIdempotencyKey", () => {
  it("is stable across repository ordering and letter case", () => {
    const first = stableIdempotencyKey("ai_intelligence", [
      { owner: "OpenAI", repo: "Codex" },
      { owner: "acme", repo: "agent" },
    ]);
    const reordered = stableIdempotencyKey("AI_INTELLIGENCE", [
      { owner: "ACME", repo: "AGENT" },
      { owner: "openai", repo: "codex" },
    ]);
    expect(first).toBe(reordered);
    expect(first).toMatch(/^starcat-curated-[a-f0-9]{64}$/);
  });
});

describe("local Agent identification", () => {
  it("accepts only repositories that GitHub verifies", async () => {
    const candidate: GitHubCandidate = {
      fullName: "openai/codex",
      htmlURL: "https://github.com/openai/codex",
      description: "Lightweight coding agent that runs in your terminal",
      stars: 1,
      language: "Rust",
      ownerAvatar: "https://example.com/avatar.png",
      archived: false,
      readmeExcerpt: "Codex CLI",
      matchedBy: "codex agent",
    };
    const store = {
      loadConfig: async () => ({
        agent: { runtime: "codex", baseURL: "", model: "" },
      }),
      loadSecrets: async () => ({ githubToken: "github-token" }),
    } as unknown as ConfigStore;
    const app = createImportRoutes(store, {
      runLocalAgent: async () => ({
        findings: [
          {
            original: "OpenAI Codex CLI",
            title: "Codex CLI",
            repository: "openai/codex",
            status: "confirmed",
            confidence: 0.99,
            reason: "官方 OpenAI 仓库。",
          },
          {
            original: "Closed source product",
            title: "Closed source product",
            repository: "vendor/missing",
            status: "confirmed",
            confidence: 0.7,
            reason: "名称相似。",
          },
        ],
      }),
      fetchRepository: async (fullName) =>
        fullName === "openai/codex" ? candidate : null,
    });

    const response = await app.request("/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "two clues" }),
    });
    const payload = (await response.json()) as {
      data: {
        findings: Array<{
          status: string;
          repository: string | null;
          selected: boolean;
          reason: string;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data.findings[0]).toMatchObject({
      status: "confirmed",
      repository: "openai/codex",
      selected: true,
    });
    expect(payload.data.findings[1]).toMatchObject({
      status: "not_found",
      repository: null,
      selected: false,
    });
    expect(payload.data.findings[1].reason).toContain("GitHub API 未找到");
  });
});

describe("Weekly manual sources", () => {
  it("lists and creates categories through the Weekly admin contract", async () => {
    const requests: UpstreamRequest[] = [];
    const store = {} as ConfigStore;
    const app = createImportRoutes(store, {
      requestUpstream: async (_store, request) => {
        requests.push(request);
        const source = {
          code: "developer_tools",
          display_name_zh: "开发工具",
          display_name_en: "Developer Tools",
          manual_import_enabled: true,
        };
        return {
          ok: true,
          status: request.method === "POST" ? 201 : 200,
          durationMs: 1,
          body:
            request.method === "POST"
              ? { data: source }
              : { data: [source], meta: { total: 1 } },
        };
      },
    });

    const listed = await app.request("/sources?environment=production");
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      data: [{ code: "developer_tools" }],
    });

    const created = await app.request("/sources?environment=test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "developer_tools",
        display_name_zh: "开发工具",
        display_name_en: "Developer Tools",
      }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      data: { code: "developer_tools" },
    });
    expect(requests).toEqual([
      expect.objectContaining({
        environment: "production",
        service: "weekly",
        path: "/internal/sources?manual_import=true",
        auth: "adminKey",
      }),
      expect.objectContaining({
        environment: "test",
        service: "weekly",
        method: "POST",
        path: "/internal/sources",
        auth: "adminKey",
        body: {
          code: "developer_tools",
          display_name_zh: "开发工具",
          display_name_en: "Developer Tools",
        },
      }),
    ]);
  });
});
