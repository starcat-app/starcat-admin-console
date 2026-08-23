/** Awesome managed source CRUD、同步和发布代理。 */
import { Hono, type Context } from "hono";
import { z } from "zod";

import type { ConfigStore } from "./config-store.js";
import type { EnvironmentId } from "./types.js";
import { requestUpstream } from "./upstream.js";

const awesomeSourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  repo_full_name: z.string().min(3),
  display_name: z.string().min(1),
  image_url: z.union([z.literal(""), z.string().url().startsWith("https://")]),
  summary_zh: z.string(),
  summary_en: z.string(),
  featured: z.boolean(),
  sort_order: z.number().int(),
  revision: z.number().int().optional(),
});

const sourceActions = new Set(["sync", "publish", "archive"]);

export function createAwesomeRoutes(store: ConfigStore) {
  const app = new Hono();

  app.get("/sources", async (context) => {
    return proxyJSON(context, store, {
      environment: parseEnvironment(context.req.query("environment")),
      method: "GET",
      path: "/internal/discovery/awesome/sources",
    });
  });

  app.post("/sources", async (context) => {
    const body = awesomeSourceSchema.parse(await context.req.json());
    return proxyJSON(context, store, {
      environment: parseEnvironment(context.req.query("environment")),
      method: "POST",
      path: "/internal/discovery/awesome/sources",
      body,
    });
  });

  app.patch("/sources/:source", async (context) => {
    const source = encodeURIComponent(context.req.param("source"));
    const body = awesomeSourceSchema.parse(await context.req.json());
    return proxyJSON(context, store, {
      environment: parseEnvironment(context.req.query("environment")),
      method: "PATCH",
      path: `/internal/discovery/awesome/sources/${source}`,
      body,
    });
  });

  app.post("/sources/:source/:action", async (context) => {
    const action = context.req.param("action");
    if (!sourceActions.has(action)) {
      return context.json({ error: "unknown Awesome source action" }, 404);
    }
    const source = encodeURIComponent(context.req.param("source"));
    return proxyJSON(context, store, {
      environment: parseEnvironment(context.req.query("environment")),
      method: "POST",
      path: `/internal/discovery/awesome/sources/${source}/${action}`,
    });
  });

  app.get("/sources/:source/sync-runs", async (context) => {
    const source = encodeURIComponent(context.req.param("source"));
    return proxyJSON(context, store, {
      environment: parseEnvironment(context.req.query("environment")),
      method: "GET",
      path: `/internal/discovery/awesome/sources/${source}/sync-runs`,
    });
  });

  return app;
}

async function proxyJSON(
  context: Context,
  store: ConfigStore,
  request: {
    environment: EnvironmentId;
    method: "GET" | "POST" | "PATCH";
    path: string;
    body?: unknown;
  },
) {
  const result = await requestUpstream(store, {
    ...request,
    service: "discovery",
    auth: "adminKey",
  });
  return context.json(result.body as never, result.status as never);
}

function parseEnvironment(value?: string): EnvironmentId {
  if (value === "test" || value === "production") return value;
  throw new Error("environment must be test or production");
}

export { awesomeSourceSchema };
