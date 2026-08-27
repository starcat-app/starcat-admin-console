/** 固定 argv 子进程执行器；禁止 shell 拼接并限制输出、超时和环境变量。 */
import { spawn } from "node:child_process";

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessRequest {
  executable: string;
  args: string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
  maximumOutputBytes: number;
  signal?: AbortSignal;
}

export interface DataPlatformProcessExecutor {
  run(request: ProcessRequest): Promise<ProcessResult>;
}

export class LocalProcessExecutor implements DataPlatformProcessExecutor {
  run(request: ProcessRequest) {
    return new Promise<ProcessResult>((resolve, reject) => {
      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      request.signal?.addEventListener("abort", forwardAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      const child = spawn(request.executable, request.args, {
        cwd: request.cwd,
        env: request.environment,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        signal: controller.signal,
      });
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        request.signal?.removeEventListener("abort", forwardAbort);
        callback();
      };
      const append = (target: "stdout" | "stderr", chunk: Buffer) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > request.maximumOutputBytes) {
          controller.abort();
          return;
        }
        if (target === "stdout") stdout += chunk.toString("utf8");
        else stderr += chunk.toString("utf8");
      };
      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      child.on("error", (error) => finish(() => reject(error)));
      child.on("close", (code) =>
        finish(() =>
          resolve({
            exitCode: code ?? 1,
            stdout,
            stderr: stderr.slice(-8_192),
          }),
        ),
      );
    });
  }
}

export function dataPlatformEnvironment(
  billingProject: string,
): NodeJS.ProcessEnv {
  const allowedKeys = [
    "HOME",
    "PATH",
    "TMPDIR",
    "SSL_CERT_FILE",
    "REQUESTS_CA_BUNDLE",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "CLOUDSDK_CONFIG",
  ] as const;
  const environment: NodeJS.ProcessEnv = {
    PYTHONUNBUFFERED: "1",
    GOOGLE_CLOUD_PROJECT: billingProject,
  };
  for (const key of allowedKeys) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}
