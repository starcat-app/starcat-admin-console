/** Agent 运行时诊断路由测试，禁止测试期间真实调用本机模型。 */
import { describe, expect, it } from "vitest";

import type { ConfigStore } from "./config-store.js";
import { createConfigRoutes } from "./routes-config.js";

describe("Agent runtime routes", () => {
  it("returns local CLI installation metadata", async () => {
    const app = createConfigRoutes({} as ConfigStore, {
      inspectAgent: async (runtime) => ({
        runtime,
        available: true,
        command: `/opt/homebrew/bin/${runtime}`,
        version: `${runtime} test-version`,
      }),
    });

    const response = await app.request("/agent/runtimes");
    const payload = (await response.json()) as {
      data: Array<{ runtime: string; command: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([
      expect.objectContaining({
        runtime: "codex",
        command: "/opt/homebrew/bin/codex",
      }),
      expect.objectContaining({
        runtime: "claude",
        command: "/opt/homebrew/bin/claude",
      }),
    ]);
  });

  it("tests the selected CLI through structured output", async () => {
    const app = createConfigRoutes({} as ConfigStore, {
      runLocalAgent: async (input) => {
        expect(input.runtime).toBe("claude");
        expect(input.timeoutMs).toBe(60_000);
        return { ok: true };
      },
    });

    const response = await app.request("/agent/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "claude" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { runtime: "claude", ok: true },
    });
  });
});
