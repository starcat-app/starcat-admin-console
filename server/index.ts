/**
 * Starcat Admin Console 本地 BFF 入口。
 *
 * 服务只绑定回环地址，并同时校验 Host 与 Origin。前端静态资源和所有 API
 * 使用同一进程提供，避免生产密钥进入浏览器或跨域调用链。
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";

import { ConfigStore } from "./config-store.js";
import { createAwesomeRoutes } from "./routes-awesome.js";
import { createConfigRoutes } from "./routes-config.js";
import { createFlyRoutes } from "./routes-fly.js";
import { createImportRoutes } from "./routes-imports.js";
import { createServicesRoutes } from "./routes-services.js";
import { UpstreamError } from "./upstream.js";

const app = new Hono();
const store = new ConfigStore();
const port = parsePort(process.env.PORT);

app.use("*", secureHeaders());
app.use("/api/*", bodyLimit({ maxSize: 256 * 1024 }));
app.use("/api/*", async (context, next) => {
  if (!isLocalHost(context.req.header("host"))) {
    return context.json({ error: "unexpected Host header" }, 403);
  }
  const origin = context.req.header("origin");
  if (origin && !isLocalOrigin(origin)) {
    return context.json({ error: "unexpected Origin header" }, 403);
  }
  await next();
  context.header("Cache-Control", "no-store");
});

app.get("/api/healthz", (context) =>
  context.json({ data: { service: "starcat-admin-console", ok: true } }),
);
app.route("/api/config", createConfigRoutes(store));
app.route("/api/services", createServicesRoutes(store));
app.route("/api/awesome", createAwesomeRoutes(store));
app.route("/api/imports", createImportRoutes(store));
app.route("/api/fly", createFlyRoutes(store));

app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

app.notFound((context) => context.json({ error: "not found" }, 404));
app.onError((error, context) => {
  if (error instanceof ZodError) {
    return context.json(
      { error: "validation failed", issues: error.issues },
      400,
    );
  }
  if (error instanceof UpstreamError) {
    return context.json(
      { error: error.message },
      normalizeStatus(error.status),
    );
  }
  console.error("Starcat Admin Console request failed", safeError(error));
  return context.json({ error: "internal error" }, 500);
});

serve(
  {
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port,
  },
  (info) => {
    console.log(`Starcat Admin Console: http://127.0.0.1:${info.port}`);
    console.log(`Local data: ${store.dataDirectory}`);
  },
);

function isLocalHost(value?: string) {
  if (!value) return false;
  const hostname = value.startsWith("[")
    ? value.slice(1, value.indexOf("]"))
    : value.split(":", 1)[0];
  return (
    hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
  );
}

function isLocalOrigin(value: string) {
  try {
    return isLocalHost(new URL(value).host);
  } catch {
    return false;
  }
}

function parsePort(value?: string) {
  const parsed = Number.parseInt(value ?? "8787", 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535
    ? parsed
    : 8787;
}

function normalizeStatus(status: number) {
  if (status >= 400 && status <= 599) return status as 400;
  return 500 as const;
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return "unknown error";
  return {
    name: error.name,
    message: error.message,
  };
}

export { app, isLocalHost, isLocalOrigin };
