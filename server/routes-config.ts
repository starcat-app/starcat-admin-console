/** 浏览器可用的脱敏配置读写路由。 */
import { Hono } from "hono";
import { z } from "zod";

import type { ConfigStore } from "./config-store.js";
import {
  inspectLocalAgent,
  localAgentRuntimes,
  runStructuredLocalAgent,
  userFacingAgentError,
  type LocalAgentStatus,
  type StructuredLocalAgentInput,
} from "./local-agent.js";
import { credentialKindsForService } from "./service-registry.js";
import {
  serviceIds,
  type EnvironmentId,
  type SecretKind,
  type ServiceId,
} from "./types.js";
import { UpstreamError } from "./upstream.js";

const secretValueSchema = z.object({ value: z.string().max(20_000) });
const globalSecretKinds = new Set(["agentApiKey", "githubToken", "flyToken"]);
const localRuntimeSchema = z.enum(localAgentRuntimes);
const localAgentTestSchema = z.object({ ok: z.literal(true) });
const localAgentTestJSONSchema = {
  type: "object",
  properties: { ok: { type: "boolean", const: true } },
  required: ["ok"],
  additionalProperties: false,
} satisfies Record<string, unknown>;

interface ConfigRouteDependencies {
  inspectAgent?: (
    runtime: (typeof localAgentRuntimes)[number],
    cwd: string,
  ) => Promise<LocalAgentStatus>;
  runLocalAgent?: (input: StructuredLocalAgentInput) => Promise<unknown>;
}

export function createConfigRoutes(
  store: ConfigStore,
  dependencies: ConfigRouteDependencies = {},
) {
  const app = new Hono();

  app.get("/", async (context) => {
    return context.json({ data: await store.publicConfig() });
  });

  app.put("/profiles/:environment", async (context) => {
    const environment = parseEnvironment(context.req.param("environment"));
    await store.updateProfile(environment, await context.req.json());
    return context.json({ data: await store.publicConfig() });
  });

  app.put("/profiles/:environment/secrets/sharedApiKey", async (context) => {
    const environment = parseEnvironment(context.req.param("environment"));
    if (environment !== "production") {
      return context.json(
        { error: "shared API key is only available in production" },
        400,
      );
    }
    const { value } = secretValueSchema.parse(await context.req.json());
    const state = await store.updateProductionSharedApiKey(value);
    return context.json({ data: state });
  });

  app.put("/profiles/:environment/:service/secrets/:kind", async (context) => {
    const environment = parseEnvironment(context.req.param("environment"));
    const service = parseService(context.req.param("service"));
    const kind = parseSecretKind(context.req.param("kind"));
    if (environment === "production" && kind === "apiKey") {
      return context.json(
        { error: "production API key must use the shared API key" },
        400,
      );
    }
    if (!credentialKindsForService(service).includes(kind)) {
      return context.json(
        { error: `${kind} is not supported by ${service}` },
        400,
      );
    }
    const { value } = secretValueSchema.parse(await context.req.json());
    const state = await store.updateServiceSecret(
      environment,
      service,
      kind,
      value,
    );
    return context.json({ data: state });
  });

  app.put("/agent", async (context) => {
    await store.updateAgent(await context.req.json());
    return context.json({ data: await store.publicConfig() });
  });

  app.get("/agent/runtimes", async (context) => {
    const inspect = dependencies.inspectAgent ?? inspectLocalAgent;
    const statuses = await Promise.all(
      localAgentRuntimes.map((runtime) => inspect(runtime, process.cwd())),
    );
    return context.json({ data: statuses });
  });

  app.post("/agent/test", async (context) => {
    const { runtime } = z
      .object({ runtime: localRuntimeSchema })
      .parse(await context.req.json());
    const run = dependencies.runLocalAgent ?? runStructuredLocalAgent;
    try {
      const result = localAgentTestSchema.parse(
        await run({
          runtime,
          cwd: process.cwd(),
          timeoutMs: 60_000,
          schema: localAgentTestJSONSchema,
          prompt:
            'This is a local connectivity test. Return only {"ok":true} using the requested JSON Schema. Do not call tools.',
        }),
      );
      return context.json({ data: { runtime, ...result } });
    } catch (error) {
      throw new UpstreamError(502, userFacingAgentError(error));
    }
  });

  app.put("/fly", async (context) => {
    await store.updateFly(await context.req.json());
    return context.json({ data: await store.publicConfig() });
  });

  app.put("/secrets/:kind", async (context) => {
    const kind = context.req.param("kind");
    if (!globalSecretKinds.has(kind)) {
      return context.json({ error: "unknown global secret kind" }, 404);
    }
    const { value } = secretValueSchema.parse(await context.req.json());
    const state = await store.updateGlobalSecret(
      kind as "agentApiKey" | "githubToken" | "flyToken",
      value,
    );
    return context.json({ data: state });
  });

  return app;
}

function parseEnvironment(value: string): EnvironmentId {
  if (value === "test" || value === "production") return value;
  throw new Error("environment must be test or production");
}

function parseService(value: string): ServiceId {
  if ((serviceIds as readonly string[]).includes(value))
    return value as ServiceId;
  throw new Error(`unknown service: ${value}`);
}

function parseSecretKind(value: string): SecretKind {
  if (value === "apiKey" || value === "adminKey") return value;
  throw new Error("secret kind must be apiKey or adminKey");
}
