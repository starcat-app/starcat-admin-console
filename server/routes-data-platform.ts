/** 本机数据平台同源 BFF 路由；所有写操作都进入固定 Action Job。 */
import { Hono } from "hono";
import { ZodError, z } from "zod";

import type { DataPlatformRuntime } from "./data-platform/runtime.js";
import { downloadActionIds, downloadEventIds } from "./data-platform/types.js";

const sqlBaseSchema = z.object({
  sql: z
    .string()
    .min(1)
    .max(100 * 1024),
  maximumBytesBilled: z
    .number()
    .int()
    .positive()
    .max(10 * (1 << 30)),
});

const sqlQuerySchema = sqlBaseSchema.extend({
  expectedSqlSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  maximumResultRows: z.number().int().min(1).max(200).default(200),
});

export function createDataPlatformRoutes(runtime?: DataPlatformRuntime) {
  const app = new Hono();

  // 数据平台路由也会被测试或工具独立挂载，因此参数错误必须在自身边界内稳定返回 400，
  // 不能隐式依赖主应用的全局 onError。
  app.onError((error, context) => {
    if (error instanceof ZodError) {
      return context.json(
        { error: "validation failed", issues: error.issues },
        400,
      );
    }
    throw error;
  });

  app.get("/config", (context) =>
    context.json({
      data: runtime
        ? { available: true, ...runtime.publicConfig() }
        : { available: false },
    }),
  );

  app.use("*", async (context, next) => {
    if (!runtime) {
      return context.json(
        {
          error: "data platform is not configured",
          code: "DATA_PLATFORM_NOT_CONFIGURED",
        },
        503,
      );
    }
    await next();
  });

  app.get("/overview", async (context) => {
    const active = requireRuntime(runtime);
    const [downloads, jobs] = await Promise.all([
      active.downloads(),
      active.jobs(10),
    ]);
    return context.json({
      data: {
        config: active.publicConfig(),
        downloads,
        jobs,
      },
    });
  });

  app.get("/bigquery/downloads", async (context) =>
    context.json({ data: await requireRuntime(runtime).downloads() }),
  );

  app.post("/bigquery/downloads/:event/:action", async (context) => {
    const event = z.enum(downloadEventIds).parse(context.req.param("event"));
    const action = z.enum(downloadActionIds).parse(context.req.param("action"));
    const job = await requireRuntime(runtime).createDownloadJob(event, action);
    return context.json({ data: job }, 202);
  });

  app.post("/bigquery/sql/dry-run", async (context) => {
    const input = sqlBaseSchema.parse(await context.req.json());
    const job = await requireRuntime(runtime).createSqlLabJob("dry-run", input);
    return context.json({ data: job }, 202);
  });

  app.post("/bigquery/sql/query", async (context) => {
    const input = sqlQuerySchema.parse(await context.req.json());
    const job = await requireRuntime(runtime).createSqlLabJob("query", input);
    return context.json({ data: job }, 202);
  });

  app.get("/jobs", async (context) => {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .parse(context.req.query("limit"));
    return context.json({ data: await requireRuntime(runtime).jobs(limit) });
  });

  app.get("/jobs/:jobId", async (context) => {
    const job = await requireRuntime(runtime).job(context.req.param("jobId"));
    return job
      ? context.json({ data: job })
      : context.json({ error: "job not found" }, 404);
  });

  app.get("/jobs/:jobId/result", async (context) => {
    const active = requireRuntime(runtime);
    const jobId = context.req.param("jobId");
    const job = await active.job(jobId);
    if (!job) return context.json({ error: "job not found" }, 404);
    const result = active.result(jobId);
    return result
      ? context.json({ data: result })
      : context.json(
          { error: "transient result expired or is not ready" },
          job.state === "succeeded" ? 410 : 409,
        );
  });

  app.post("/jobs/:jobId/cancel", async (context) => {
    const job = await requireRuntime(runtime).cancel(
      context.req.param("jobId"),
    );
    return job
      ? context.json({ data: job })
      : context.json({ error: "job not found" }, 404);
  });

  return app;
}

function requireRuntime(runtime?: DataPlatformRuntime): DataPlatformRuntime {
  if (!runtime) throw new Error("data platform runtime is not configured");
  return runtime;
}
