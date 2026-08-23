import { describe, expect, it } from "vitest";

import { stableIdempotencyKey } from "./routes-imports.js";

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
