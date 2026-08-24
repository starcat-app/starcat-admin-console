/** Starcat 上游请求适配器：集中处理环境路由、鉴权和超时。 */
import type { ConfigStore } from "./config-store.js";
import type { EnvironmentId, SecretKind, ServiceId } from "./types.js";

export interface UpstreamRequest {
  environment: EnvironmentId;
  service: ServiceId;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  auth?: SecretKind;
  body?: unknown;
}

export interface UpstreamResult {
  ok: boolean;
  status: number;
  durationMs: number;
  body: unknown;
}

export async function requestUpstream(
  store: ConfigStore,
  request: UpstreamRequest,
): Promise<UpstreamResult> {
  const [config, secrets] = await Promise.all([
    store.loadConfig(),
    store.loadSecrets(),
  ]);
  const profile = config.profiles[request.environment];
  const serviceConfig = profile.services[request.service];
  const baseURL =
    request.environment === "production"
      ? profile.gatewayURL || serviceConfig.baseURL
      : serviceConfig.baseURL;

  if (!baseURL.trim()) {
    throw new UpstreamError(400, `missing base URL for ${request.service}`);
  }

  const target = new URL(request.path, `${baseURL.replace(/\/+$/, "")}/`);
  const headers = new Headers({
    Accept: "application/json",
  });
  if (request.environment === "production") {
    headers.set("X-SC-Svc", request.service);
  }
  if (request.auth) {
    const secret =
      secrets.profiles[request.environment][request.service][request.auth];
    if (!secret) {
      throw new UpstreamError(
        400,
        `${request.auth} is not configured for ${request.environment}/${request.service}`,
      );
    }
    headers.set("Authorization", `Bearer ${secret}`);
  }
  if (request.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method ?? "GET",
      headers,
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new UpstreamError(
      502,
      error instanceof Error ? error.message : "upstream request failed",
    );
  }

  const durationMs = Math.round(performance.now() - startedAt);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    durationMs,
    body: parseBody(text),
  };
}

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
