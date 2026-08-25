/**
 * 本机 Agent CLI 适配器。
 *
 * Admin Console 只在回环地址运行，因此可以复用当前 macOS 用户已经登录的
 * Codex CLI / Claude Code。这里刻意使用 `spawn(command, args)` 而不是 Shell，
 * 原始运营文本只通过 stdin 传入，避免文本内容参与命令解析。
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const localAgentRuntimes = ["codex", "claude"] as const;
export type LocalAgentRuntime = (typeof localAgentRuntimes)[number];

export interface LocalAgentStatus {
  runtime: LocalAgentRuntime;
  available: boolean;
  command: string;
  version?: string;
  error?: string;
}

export interface ProcessSpec {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export type ProcessExecutor = (spec: ProcessSpec) => Promise<ProcessResult>;

export interface StructuredLocalAgentInput {
  runtime: LocalAgentRuntime;
  prompt: string;
  schema: Record<string, unknown>;
  cwd: string;
  timeoutMs?: number;
}

const defaultTimeoutMs = 180_000;
const defaultMaxOutputBytes = 2 * 1024 * 1024;

/** 用户可配置目录与已登录状态必须保留，但业务服务密钥绝不能整包继承。 */
const inheritedEnvironmentKeys = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "XDG_CONFIG_HOME",
  "CODEX_HOME",
  "CLAUDE_CONFIG_DIR",
  "CODEX_API_KEY",
  "OPENAI_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
] as const;

export class LocalAgentError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "timeout"
      | "output_limit"
      | "process_failed"
      | "invalid_output",
  ) {
    super(message);
    this.name = "LocalAgentError";
  }
}

/**
 * 运行一次无状态、只读的本机 Agent，并返回符合 JSON Schema 的对象。
 * Codex 通过临时文件接收 schema/最终输出；Claude Code 则直接在 JSON 包装中
 * 返回 structured_output。临时目录无论成功失败都会删除。
 */
export async function runStructuredLocalAgent(
  input: StructuredLocalAgentInput,
  execute: ProcessExecutor = executeProcess,
) {
  const directory = await mkdtemp(path.join(tmpdir(), "starcat-agent-"));
  const schemaPath = path.join(directory, "schema.json");
  const outputPath = path.join(directory, "output.json");

  try {
    await writeFile(schemaPath, JSON.stringify(input.schema), {
      encoding: "utf8",
      mode: 0o600,
    });
    const invocation = buildStructuredInvocation(
      input.runtime,
      schemaPath,
      outputPath,
      input.schema,
    );
    const result = await execute({
      ...invocation,
      cwd: input.cwd,
      env: localAgentEnvironment(),
      stdin: input.prompt,
      timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
      maxOutputBytes: defaultMaxOutputBytes,
    });

    if (input.runtime === "codex") {
      try {
        return JSON.parse(await readFile(outputPath, "utf8")) as unknown;
      } catch {
        // 某些 CLI 失败路径不会生成 -o 文件；stdout 仍可帮助兼容版本差异。
        return parseStructuredOutput(result.stdout, input.runtime);
      }
    }
    return parseStructuredOutput(result.stdout, input.runtime);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** 读取版本只用于设置页诊断，不触发模型调用，也不会读取控制台密钥。 */
export async function inspectLocalAgent(
  runtime: LocalAgentRuntime,
  cwd: string,
  execute: ProcessExecutor = executeProcess,
): Promise<LocalAgentStatus> {
  const command = runtime;
  try {
    const result = await execute({
      command,
      args: ["--version"],
      cwd,
      env: localAgentEnvironment(),
      timeoutMs: 5_000,
      maxOutputBytes: 8 * 1024,
    });
    const version = `${result.stdout}\n${result.stderr}`.trim();
    return { runtime, available: true, command, version };
  } catch (error) {
    return {
      runtime,
      available: false,
      command,
      error: userFacingAgentError(error),
    };
  }
}

export function buildStructuredInvocation(
  runtime: LocalAgentRuntime,
  schemaPath: string,
  outputPath: string,
  schema: Record<string, unknown>,
) {
  if (runtime === "codex") {
    return {
      command: "codex",
      args: [
        "--search",
        "--ask-for-approval",
        "never",
        "exec",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "--ignore-user-config",
        "--ignore-rules",
        "--output-schema",
        schemaPath,
        "-o",
        outputPath,
        "-",
      ],
    };
  }

  return {
    command: "claude",
    args: [
      "--print",
      "--safe-mode",
      "--input-format",
      "text",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(schema),
      "--no-session-persistence",
      "--permission-mode",
      "dontAsk",
      "--tools",
      "WebSearch,WebFetch",
      "--allowedTools",
      "WebSearch,WebFetch",
    ],
  };
}

/**
 * 只透传本机 Agent 登录真正需要的环境变量。Starcat 的 Weekly / Discovery
 * Admin Key 没有白名单项，因此识别子进程无法读取发布凭证。
 */
export function localAgentEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    inheritedEnvironmentKeys.flatMap((key) =>
      source[key] === undefined ? [] : [[key, source[key]]],
    ),
  );
}

export function parseStructuredOutput(
  source: string,
  runtime: LocalAgentRuntime,
) {
  try {
    const payload = JSON.parse(source) as unknown;
    if (runtime === "claude" && isRecord(payload)) {
      if (payload.structured_output !== undefined) {
        return payload.structured_output;
      }
      if (typeof payload.result === "string") {
        return parseJSONObject(payload.result);
      }
    }
    return payload;
  } catch {
    throw new LocalAgentError(
      `${runtimeLabel(runtime)} 返回了无法解析的结构化结果`,
      "invalid_output",
    );
  }
}

/**
 * 统一执行外部进程：限制运行时间与输出大小，失败时只返回短错误摘要。
 * `shell: false` 是关键安全边界，任何输入内容都不会被 zsh/bash 解释。
 */
export function executeProcess(spec: ProcessSpec): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    let terminationTimer: NodeJS.Timeout | undefined;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (terminationTimer) clearTimeout(terminationTimer);
      callback();
    };
    const terminate = () => {
      child.kill("SIGTERM");
      terminationTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
    };
    const append = (current: Buffer, chunk: Buffer) => {
      const next = Buffer.concat([current, chunk]);
      if (next.byteLength > spec.maxOutputBytes) {
        terminate();
        finish(() =>
          reject(
            new LocalAgentError("本机 Agent 输出超过安全上限", "output_limit"),
          ),
        );
      }
      return next;
    };

    const timeout = setTimeout(() => {
      terminate();
      finish(() =>
        reject(new LocalAgentError("本机 Agent 调用超时", "timeout")),
      );
    }, spec.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (!settled) stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (!settled) stderr = append(stderr, chunk);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(() => {
        const code = error.code === "ENOENT" ? "not_found" : "process_failed";
        const message =
          code === "not_found"
            ? `未找到本机命令：${spec.command}`
            : `无法启动本机 Agent：${error.message}`;
        reject(new LocalAgentError(message, code));
      });
    });
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) {
          resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
          return;
        }
        const detail = stderr.toString().trim().split("\n").at(-1);
        reject(
          new LocalAgentError(
            detail
              ? `本机 Agent 执行失败：${detail}`
              : `本机 Agent 执行失败（退出码 ${code ?? "unknown"}）`,
            "process_failed",
          ),
        );
      });
    });

    child.stdin.on("error", () => {
      // 子进程提前退出时可能关闭 stdin；最终错误统一由 error/close 处理。
    });
    child.stdin.end(spec.stdin ?? "");
  });
}

export function userFacingAgentError(error: unknown) {
  return error instanceof Error ? error.message : "本机 Agent 调用失败";
}

function parseJSONObject(source: string) {
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("missing JSON object");
  return JSON.parse(source.slice(start, end + 1)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function runtimeLabel(runtime: LocalAgentRuntime) {
  return runtime === "codex" ? "Codex CLI" : "Claude Code";
}
