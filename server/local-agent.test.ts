/** 本机 Agent 适配器的命令、安全环境与失败边界测试。 */
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildStructuredInvocation,
  executeProcess,
  localAgentEnvironment,
  LocalAgentError,
  parseStructuredOutput,
  resolveExecutable,
} from "./local-agent.js";

const schema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};

describe("local Agent invocation", () => {
  it("runs Codex as an ephemeral read-only process with live search", () => {
    const invocation = buildStructuredInvocation(
      "codex",
      "/tmp/schema.json",
      "/tmp/output.json",
      schema,
    );

    expect(invocation.command).toBe("codex");
    expect(invocation.args).toEqual(
      expect.arrayContaining([
        "--search",
        "never",
        "exec",
        "--ephemeral",
        "read-only",
        "--ignore-user-config",
        "--ignore-rules",
        "/tmp/schema.json",
        "/tmp/output.json",
        "-",
      ]),
    );
  });

  it("restricts Claude Code to web search and structured output", () => {
    const invocation = buildStructuredInvocation(
      "claude",
      "/tmp/schema.json",
      "/tmp/output.json",
      schema,
    );

    expect(invocation.command).toBe("claude");
    expect(invocation.args).toEqual(
      expect.arrayContaining([
        "--print",
        "--safe-mode",
        "--json-schema",
        JSON.stringify(schema),
        "--no-session-persistence",
        "dontAsk",
        "WebSearch,WebFetch",
      ]),
    );
    expect(invocation.args.join(" ")).not.toMatch(/\b(?:Bash|Edit|Write)\b/);
  });

  it("does not pass Starcat service secrets into Agent processes", () => {
    const environment = localAgentEnvironment({
      PATH: "/opt/homebrew/bin",
      HOME: "/Users/test",
      CODEX_HOME: "/Users/test/.codex",
      WEEKLY_ADMIN_API_KEYS: "weekly-secret",
      DISCOVERY_ADMIN_API_KEYS: "discovery-secret",
      STARCAT_API_KEY: "gateway-secret",
    });

    expect(environment).toEqual({
      PATH: "/opt/homebrew/bin",
      HOME: "/Users/test",
      CODEX_HOME: "/Users/test/.codex",
    });
  });

  it("resolves an executable path without invoking a shell", async () => {
    expect(
      await resolveExecutable("node", { PATH: path.dirname(process.execPath) }),
    ).toBe(process.execPath);
  });

  it("reads Claude structured_output instead of the JSON envelope", () => {
    expect(
      parseStructuredOutput(
        JSON.stringify({
          type: "result",
          result: "unused",
          structured_output: { ok: true },
        }),
        "claude",
      ),
    ).toEqual({ ok: true });
  });
});

describe("executeProcess", () => {
  it("passes untrusted content through stdin without shell evaluation", async () => {
    const marker = "$(printf should-not-run) `printf neither`";
    const result = await executeProcess({
      command: process.execPath,
      args: [
        "-e",
        "process.stdin.setEncoding('utf8');let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write(s));",
      ],
      cwd: process.cwd(),
      env: localAgentEnvironment(),
      stdin: marker,
      timeoutMs: 2_000,
      maxOutputBytes: 8 * 1024,
    });

    expect(result.stdout).toBe(marker);
  });

  it("terminates a stalled process", async () => {
    await expect(
      executeProcess({
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        cwd: process.cwd(),
        env: localAgentEnvironment(),
        timeoutMs: 30,
        maxOutputBytes: 8 * 1024,
      }),
    ).rejects.toMatchObject<Partial<LocalAgentError>>({ code: "timeout" });
  });
});
