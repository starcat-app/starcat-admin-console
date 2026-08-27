/**
 * API 客户端错误 envelope 回归测试。
 *
 * Discovery 等上游服务会返回结构化错误对象，而控制台自身也会返回字符串错误；
 * 两种契约都必须向页面提供可读消息，不能泄漏对象的默认字符串表示。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";

describe("api error envelope", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("extracts the message from a structured upstream error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schema_version: 1,
            error: { code: "UNAUTHORIZED", message: "invalid API key" },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(api("/api/awesome/sources")).rejects.toThrow(
      "invalid API key",
    );
  });

  it("keeps the existing string error contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "missing admin key" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(api("/api/awesome/sources")).rejects.toThrow(
      "missing admin key",
    );
  });
});
