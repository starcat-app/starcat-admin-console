/**
 * 本地配置与密钥存储。
 *
 * 非敏感连接信息和 secrets 分文件保存；secrets 文件强制为 0600。浏览器只能
 * 获取是否已配置和不可逆指纹，永远不能通过 GET 请求恢复真实值。
 */
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { z } from "zod";

import {
  serviceIds,
  type ConsoleConfig,
  type EnvironmentId,
  type PublicConsoleConfig,
  type SecretKind,
  type SecretState,
  type ServiceId,
  type StoredSecrets,
} from "./types.js";

const testPorts: Record<ServiceId, number> = {
  sharing: 5001,
  trending: 5002,
  weekly: 5003,
  wiki: 5004,
  recommend: 5005,
  discovery: 5006,
};

const serviceConnectionSchema = z.object({
  baseURL: z.string(),
});

// 使用显式对象会在读取旧配置时自动丢弃未知服务（例如误加入的闭源服务），
// 同时保证六个开源业务服务的连接项完整存在。
const serviceConnectionsSchema = z.object({
  sharing: serviceConnectionSchema,
  trending: serviceConnectionSchema,
  weekly: serviceConnectionSchema,
  wiki: serviceConnectionSchema,
  recommend: serviceConnectionSchema,
  discovery: serviceConnectionSchema,
});

const environmentProfileSchema = z.object({
  gatewayURL: z.string(),
  services: serviceConnectionsSchema,
});

const consoleConfigSchema = z.object({
  profiles: z.object({
    test: environmentProfileSchema,
    production: environmentProfileSchema,
  }),
  agent: z.object({
    baseURL: z.string(),
    model: z.string(),
  }),
  fly: z.object({
    apiBaseURL: z.string(),
    apps: z.object({
      sharing: z.string(),
      trending: z.string(),
      weekly: z.string(),
      wiki: z.string(),
      recommend: z.string(),
      discovery: z.string(),
    }),
  }),
});

const secretEntrySchema = z.object({
  apiKey: z.string().optional(),
  adminKey: z.string().optional(),
});

const secretProfileSchema = z.object({
  sharing: secretEntrySchema,
  trending: secretEntrySchema,
  weekly: secretEntrySchema,
  wiki: secretEntrySchema,
  recommend: secretEntrySchema,
  discovery: secretEntrySchema,
});

const storedSecretsSchema = z.object({
  profiles: z.object({
    test: secretProfileSchema,
    production: secretProfileSchema,
  }),
  agentApiKey: z.string().optional(),
  githubToken: z.string().optional(),
  flyToken: z.string().optional(),
});

function makeDefaultProfile(environment: EnvironmentId) {
  const services = Object.fromEntries(
    serviceIds.map((service) => {
      if (environment === "test") {
        return [service, { baseURL: `http://127.0.0.1:${testPorts[service]}` }];
      }
      return [service, { baseURL: "https://starcat-api.fly.dev" }];
    }),
  ) as ConsoleConfig["profiles"][EnvironmentId]["services"];

  return {
    gatewayURL:
      environment === "production" ? "https://starcat-api.fly.dev" : "",
    services,
  };
}

function makeEmptySecretProfile() {
  return Object.fromEntries(
    serviceIds.map((service) => [service, {}]),
  ) as StoredSecrets["profiles"][EnvironmentId];
}

const defaultConfig: ConsoleConfig = {
  profiles: {
    test: makeDefaultProfile("test"),
    production: makeDefaultProfile("production"),
  },
  agent: {
    baseURL: "",
    model: "",
  },
  fly: {
    apiBaseURL: "https://api.machines.dev/v1",
    apps: {
      sharing: "starcat-sharing-api",
      trending: "starcat-trending-api",
      weekly: "starcat-weekly-api",
      wiki: "starcat-wiki-api",
      recommend: "starcat-recommend-api",
      discovery: "starcat-discovery-api",
    },
  },
};

const emptySecrets: StoredSecrets = {
  profiles: {
    test: makeEmptySecretProfile(),
    production: makeEmptySecretProfile(),
  },
};

export class ConfigStore {
  readonly dataDirectory: string;
  private readonly configPath: string;
  private readonly secretsPath: string;

  constructor(dataDirectory = resolveDataDirectory()) {
    this.dataDirectory = dataDirectory;
    this.configPath = path.join(dataDirectory, "config.json");
    this.secretsPath = path.join(dataDirectory, "secrets.json");
  }

  async loadConfig(): Promise<ConsoleConfig> {
    return this.readJSON(this.configPath, consoleConfigSchema, defaultConfig);
  }

  async loadSecrets(): Promise<StoredSecrets> {
    return this.readJSON(this.secretsPath, storedSecretsSchema, emptySecrets);
  }

  async publicConfig(): Promise<PublicConsoleConfig> {
    const [config, secrets] = await Promise.all([
      this.loadConfig(),
      this.loadSecrets(),
    ]);

    return {
      ...config,
      secrets: {
        profiles: {
          test: redactSecretProfile(secrets.profiles.test),
          production: redactSecretProfile(secrets.profiles.production),
        },
        agentApiKey: secretState(secrets.agentApiKey),
        githubToken: secretState(secrets.githubToken),
        flyToken: secretState(secrets.flyToken),
      },
      dataDirectory: this.dataDirectory,
    };
  }

  async saveConfig(input: unknown): Promise<ConsoleConfig> {
    const parsed = consoleConfigSchema.parse(input);
    await this.writeJSON(this.configPath, parsed);
    return parsed;
  }

  async updateProfile(
    environment: EnvironmentId,
    profile: unknown,
  ): Promise<ConsoleConfig> {
    const parsed = environmentProfileSchema.parse(profile);
    const config = await this.loadConfig();
    config.profiles[environment] = parsed;
    await this.writeJSON(this.configPath, config);
    return config;
  }

  async updateAgent(agent: unknown): Promise<ConsoleConfig> {
    const parsed = consoleConfigSchema.shape.agent.parse(agent);
    const config = await this.loadConfig();
    config.agent = parsed;
    await this.writeJSON(this.configPath, config);
    return config;
  }

  async updateFly(fly: unknown): Promise<ConsoleConfig> {
    const parsed = consoleConfigSchema.shape.fly.parse(fly);
    const config = await this.loadConfig();
    config.fly = parsed;
    await this.writeJSON(this.configPath, config);
    return config;
  }

  async updateServiceSecret(
    environment: EnvironmentId,
    service: ServiceId,
    kind: SecretKind,
    value: string,
  ): Promise<SecretState> {
    const secrets = await this.loadSecrets();
    const normalized = value.trim();
    if (normalized) {
      secrets.profiles[environment][service][kind] = normalized;
    } else {
      delete secrets.profiles[environment][service][kind];
    }
    await this.writeJSON(this.secretsPath, secrets, 0o600);
    return secretState(normalized);
  }

  async updateGlobalSecret(
    kind: "agentApiKey" | "githubToken" | "flyToken",
    value: string,
  ): Promise<SecretState> {
    const secrets = await this.loadSecrets();
    const normalized = value.trim();
    if (normalized) {
      secrets[kind] = normalized;
    } else {
      delete secrets[kind];
    }
    await this.writeJSON(this.secretsPath, secrets, 0o600);
    return secretState(normalized);
  }

  private async readJSON<T>(
    filePath: string,
    schema: z.ZodType<T>,
    fallback: T,
  ): Promise<T> {
    try {
      const source = await readFile(filePath, "utf8");
      return schema.parse(JSON.parse(source));
    } catch (error) {
      if (isMissingFile(error)) {
        return structuredClone(fallback);
      }
      throw error;
    }
  }

  private async writeJSON(filePath: string, value: unknown, mode = 0o600) {
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode,
    });
    await chmod(temporaryPath, mode);
    await rename(temporaryPath, filePath);
  }
}

export function secretState(value?: string): SecretState {
  const normalized = value?.trim() ?? "";
  if (!normalized) return { configured: false };
  const fingerprint = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  return { configured: true, fingerprint };
}

function redactSecretProfile(
  profile: StoredSecrets["profiles"][EnvironmentId],
) {
  return Object.fromEntries(
    serviceIds.map((service) => [
      service,
      {
        apiKey: secretState(profile[service].apiKey),
        adminKey: secretState(profile[service].adminKey),
      },
    ]),
  ) as PublicConsoleConfig["secrets"]["profiles"][EnvironmentId];
}

function resolveDataDirectory() {
  const override = process.env.STARCAT_ADMIN_DATA_DIR?.trim();
  return override || path.join(homedir(), ".config", "starcat-admin-console");
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export { consoleConfigSchema, environmentProfileSchema };
