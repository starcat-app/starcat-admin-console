/** 服务统计、连通性和白名单动作路由。 */
import { Hono } from "hono";

import type { ConfigStore } from "./config-store.js";
import {
  credentialKindsForService,
  pickValue,
  serviceRegistry,
  type ActionDescriptor,
  type ServiceDescriptor,
} from "./service-registry.js";
import { serviceIds, type EnvironmentId, type ServiceId } from "./types.js";
import { requestUpstream } from "./upstream.js";

export function createServicesRoutes(store: ConfigStore) {
  const app = new Hono();

  app.get("/", async (context) => {
    const environment = parseEnvironment(context.req.query("environment"));
    const services = await Promise.all(
      serviceIds.map((service) => loadService(store, environment, service)),
    );
    return context.json({ data: services, meta: { environment } });
  });

  app.get("/:service", async (context) => {
    const environment = parseEnvironment(context.req.query("environment"));
    const service = parseService(context.req.param("service"));
    return context.json({
      data: await loadService(store, environment, service),
    });
  });

  app.post("/:service/actions/:action", async (context) => {
    const environment = parseEnvironment(context.req.query("environment"));
    const service = parseService(context.req.param("service"));
    const descriptor = serviceRegistry[service];
    const action = descriptor.actions.find(
      (candidate) => candidate.id === context.req.param("action"),
    );
    if (!action) {
      return context.json({ error: "action is not registered" }, 404);
    }
    if (descriptor.readOnly) {
      return context.json({ error: "service is read only" }, 403);
    }

    const body = validateActionBody(
      action,
      await readOptionalBody(context.req.raw),
    );
    const result = await runAction(store, environment, service, action, body);
    return context.json({ data: result }, result.ok ? 200 : 502);
  });

  return app;
}

async function loadService(
  store: ConfigStore,
  environment: EnvironmentId,
  service: ServiceId,
) {
  const descriptor = serviceRegistry[service];
  const publicConfig = await store.publicConfig();
  const secretState = publicConfig.secrets.profiles[environment][service];

  const health = await attemptRequest(() =>
    requestUpstream(store, {
      environment,
      service,
      path: "/healthz",
    }),
  );

  const ping = secretState.apiKey.configured
    ? await attemptRequest(() =>
        requestUpstream(store, {
          environment,
          service,
          path: "/api/v1/ping",
          auth: "apiKey",
        }),
      )
    : {
        ok: false,
        status: 0,
        durationMs: 0,
        body: null,
        error: "API key not configured",
      };

  const stats = await Promise.all(
    descriptor.stats.map(async (stat) => {
      if (!secretState[stat.auth].configured) {
        return {
          id: stat.id,
          label: stat.label,
          value: null,
          description: stat.description,
          error: `${stat.auth} not configured`,
        };
      }
      const result = await attemptRequest(() =>
        requestUpstream(store, {
          environment,
          service,
          path: stat.path,
          auth: stat.auth,
        }),
      );
      return {
        id: stat.id,
        label: stat.label,
        value: result.ok ? (pickValue(result.body, stat.pick) ?? null) : null,
        description: stat.description,
        error: result.ok
          ? undefined
          : (result.error ?? `HTTP ${result.status}`),
      };
    }),
  );

  return {
    id: descriptor.id,
    label: descriptor.label,
    description: descriptor.description,
    readOnly: descriptor.readOnly,
    online: health.ok && (ping.ok || !secretState.apiKey.configured),
    authenticated: ping.ok,
    latencyMs: ping.durationMs || health.durationMs,
    health,
    ping,
    stats,
    actions: descriptor.actions,
    credentialKinds: credentialKindsForService(service),
    credentials: secretState,
  };
}

async function runAction(
  store: ConfigStore,
  environment: EnvironmentId,
  service: ServiceId,
  action: ActionDescriptor,
  body: unknown,
) {
  return requestUpstream(store, {
    environment,
    service,
    method: action.method,
    path: action.path,
    auth: action.auth,
    body: action.method === "GET" ? undefined : body,
  });
}

async function attemptRequest<
  T extends { ok: boolean; status: number; durationMs: number; body: unknown },
>(operation: () => Promise<T>) {
  try {
    const result = await operation();
    return {
      ...result,
      error: result.ok ? undefined : describeUpstreamBody(result.body),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: 0,
      body: null,
      error: error instanceof Error ? error.message : "request failed",
    };
  }
}

function describeUpstreamBody(body: unknown) {
  if (typeof body === "string") return body.slice(0, 200);
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const error = record.error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string") return message;
    }
  }
  return "upstream request failed";
}

function parseEnvironment(value?: string): EnvironmentId {
  if (value === "test" || value === "production") return value;
  throw new Error("environment must be test or production");
}

function parseService(value: string): ServiceId {
  if ((serviceIds as readonly string[]).includes(value))
    return value as ServiceId;
  throw new Error(`unknown service: ${value}`);
}

async function readOptionalBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return undefined;
  return JSON.parse(text);
}

/** 仅提取注册表声明过的文本字段，阻止未登记 payload 穿透 BFF。 */
function validateActionBody(action: ActionDescriptor, input: unknown) {
  if (!action.fields?.length) return undefined;
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const output: Record<string, string> = {};
  for (const field of action.fields) {
    const rawValue = source[field.name];
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (field.required && !value) throw new Error(`${field.name} is required`);
    if (value) output[field.name] = value;
  }
  return output;
}

export type ServiceStatus = Awaited<ReturnType<typeof loadService>>;
export type { ServiceDescriptor };
