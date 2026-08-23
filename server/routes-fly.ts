/**
 * Fly.io 高级运维路由。
 *
 * 浏览器只能看到 secret 名称与 digest；本地 `.env` 的值由 BFF 读取后直接发送
 * 到 Fly，永远不经过页面或响应 payload。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Hono } from "hono";
import { z } from "zod";

import type { ConfigStore } from "./config-store.js";
import { UpstreamError } from "./upstream.js";

const flyServiceIds = [
  "sharing",
  "trending",
  "weekly",
  "wiki",
  "recommend",
  "discovery",
] as const;
type FlyServiceId = (typeof flyServiceIds)[number];

const secretNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const setSecretSchema = z.object({ value: z.string() });
const applyLocalSchema = z.object({
  names: z.array(secretNameSchema).min(1).max(100),
});

export function createFlyRoutes(store: ConfigStore) {
  const app = new Hono();

  app.get("/apps", async (context) => {
    const config = await store.loadConfig();
    const apps = await Promise.all(
      flyServiceIds.map(async (service) => {
        try {
          const result = await flyRequest(
            store,
            "GET",
            `/apps/${encodeURIComponent(config.fly.apps[service])}`,
          );
          return {
            service,
            app: config.fly.apps[service],
            ok: result.ok,
            status: result.status,
            data: result.body,
          };
        } catch (error) {
          return {
            service,
            app: config.fly.apps[service],
            ok: false,
            status: 0,
            error:
              error instanceof Error ? error.message : "Fly request failed",
          };
        }
      }),
    );
    return context.json({ data: apps });
  });

  app.get("/apps/:service/secrets", async (context) => {
    const service = parseFlyService(context.req.param("service"));
    const appName = await appNameForService(store, service);
    const result = await flyRequest(
      store,
      "GET",
      `/apps/${encodeURIComponent(appName)}/secrets`,
    );
    return context.json({ data: result.body }, result.status as never);
  });

  app.post("/apps/:service/secrets/:name", async (context) => {
    const service = parseFlyService(context.req.param("service"));
    const name = secretNameSchema.parse(context.req.param("name"));
    const { value } = setSecretSchema.parse(await context.req.json());
    const appName = await appNameForService(store, service);
    const result = await flyRequest(
      store,
      "POST",
      `/apps/${encodeURIComponent(appName)}/secrets/${encodeURIComponent(name)}`,
      { value },
    );
    return context.json({ data: result.body }, result.status as never);
  });

  app.delete("/apps/:service/secrets/:name", async (context) => {
    const service = parseFlyService(context.req.param("service"));
    const name = secretNameSchema.parse(context.req.param("name"));
    const appName = await appNameForService(store, service);
    const result = await flyRequest(
      store,
      "DELETE",
      `/apps/${encodeURIComponent(appName)}/secrets/${encodeURIComponent(name)}`,
    );
    return context.json({ data: result.body }, result.status as never);
  });

  app.get("/local-env/:service", async (context) => {
    const service = parseFlyService(context.req.param("service"));
    const variables = await readLocalEnvironment(service);
    return context.json({
      data: [...variables.entries()].map(([name, value]) => ({
        name,
        configured: Boolean(value),
      })),
    });
  });

  app.post("/local-env/:service/apply", async (context) => {
    const service = parseFlyService(context.req.param("service"));
    const { names } = applyLocalSchema.parse(await context.req.json());
    const variables = await readLocalEnvironment(service);
    const appName = await appNameForService(store, service);
    const results = [];
    for (const name of names) {
      const value = variables.get(name);
      if (value === undefined) {
        results.push({
          name,
          ok: false,
          error: "variable not found in local .env",
        });
        continue;
      }
      const result = await flyRequest(
        store,
        "POST",
        `/apps/${encodeURIComponent(appName)}/secrets/${encodeURIComponent(name)}`,
        { value },
      );
      results.push({ name, ok: result.ok, status: result.status });
    }
    return context.json({ data: results });
  });

  return app;
}

async function flyRequest(
  store: ConfigStore,
  method: "GET" | "POST" | "DELETE",
  pathname: string,
  body?: unknown,
) {
  const [config, secrets] = await Promise.all([
    store.loadConfig(),
    store.loadSecrets(),
  ]);
  if (!secrets.flyToken) {
    throw new UpstreamError(400, "Fly API token is not configured");
  }
  const target = new URL(
    pathname,
    `${config.fly.apiBaseURL.replace(/\/+$/, "")}/`,
  );
  const response = await fetch(target, {
    method,
    headers: {
      Authorization: `Bearer ${secrets.flyToken}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: parseBody(text),
  };
}

async function appNameForService(store: ConfigStore, service: FlyServiceId) {
  const config = await store.loadConfig();
  return config.fly.apps[service];
}

async function readLocalEnvironment(service: FlyServiceId) {
  const supportsDirectory =
    process.env.STARCAT_SUPPORTS_DIR?.trim() ||
    path.resolve(process.cwd(), "..");
  const filePath = path.resolve(
    supportsDirectory,
    `starcat-${service}-api`,
    ".env",
  );
  if (!filePath.startsWith(`${path.resolve(supportsDirectory)}${path.sep}`)) {
    throw new UpstreamError(403, "local environment path is outside supports");
  }
  const source = await readFile(filePath, "utf8");
  return parseEnvironmentFile(source);
}

function parseEnvironmentFile(source: string) {
  const result = new Map<string, string>();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    const rawValue = line.slice(separator + 1).trim();
    result.set(name, unquote(rawValue));
  }
  return result;
}

function unquote(value: string) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFlyService(value: string): FlyServiceId {
  if ((flyServiceIds as readonly string[]).includes(value)) {
    return value as FlyServiceId;
  }
  throw new Error(`unknown Fly service: ${value}`);
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export { parseEnvironmentFile };
export type { FlyServiceId };
