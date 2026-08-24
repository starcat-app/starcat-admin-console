/**
 * BFF 与前端共享语义所需的服务、环境和配置类型。
 *
 * 这里故意不包含任何真实密钥字段的公开 DTO，避免后续路由误把 secret
 * 直接序列化给浏览器。
 */

export const serviceIds = [
  "sharing",
  "trending",
  "weekly",
  "wiki",
  "recommend",
  "discovery",
] as const;

export type ServiceId = (typeof serviceIds)[number];
export type EnvironmentId = "test" | "production";
export type SecretKind = "apiKey" | "adminKey";

export interface ServiceConnectionConfig {
  baseURL: string;
}

export interface EnvironmentProfile {
  gatewayURL: string;
  services: Record<ServiceId, ServiceConnectionConfig>;
}

export interface AgentConfig {
  baseURL: string;
  model: string;
}

export interface FlyConfig {
  apiBaseURL: string;
  apps: Record<ServiceId, string>;
}

export interface ConsoleConfig {
  profiles: Record<EnvironmentId, EnvironmentProfile>;
  agent: AgentConfig;
  fly: FlyConfig;
}

export interface SecretState {
  configured: boolean;
  fingerprint?: string;
}

export interface PublicConsoleConfig extends ConsoleConfig {
  secrets: {
    profiles: Record<
      EnvironmentId,
      Record<ServiceId, Record<SecretKind, SecretState>>
    >;
    productionSharedApiKey: SecretState;
    agentApiKey: SecretState;
    githubToken: SecretState;
    flyToken: SecretState;
  };
  dataDirectory: string;
}

export interface StoredSecrets {
  profiles: Record<
    EnvironmentId,
    Record<ServiceId, Partial<Record<SecretKind, string>>>
  >;
  productionSharedApiKey?: string;
  agentApiKey?: string;
  githubToken?: string;
  flyToken?: string;
}
