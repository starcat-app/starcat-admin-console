/** 浏览器端公开 DTO；刻意不包含任何密钥值。 */
export type EnvironmentId = "test" | "production";

export const serviceIds = [
  "sharing",
  "trending",
  "weekly",
  "wiki",
  "recommend",
  "discovery",
] as const;

export type ServiceId = (typeof serviceIds)[number];
export type SecretKind = "apiKey" | "adminKey";

export interface SecretState {
  configured: boolean;
  fingerprint?: string;
}

export interface PublicConfig {
  profiles: Record<
    EnvironmentId,
    {
      gatewayURL: string;
      services: Record<ServiceId, { baseURL: string }>;
    }
  >;
  agent: { baseURL: string; model: string };
  fly: {
    apiBaseURL: string;
    apps: Record<ServiceId, string>;
  };
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

export interface ServiceAction {
  id: string;
  label: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  destructive: boolean;
  description: string;
  fields?: Array<{
    name: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
}

export interface ServiceStatus {
  id: ServiceId;
  label: string;
  description: string;
  readOnly: boolean;
  online: boolean;
  authenticated: boolean;
  latencyMs: number;
  stats: Array<{
    id: string;
    label: string;
    value: unknown;
    description: string;
    error?: string;
  }>;
  actions: ServiceAction[];
  credentialKinds: SecretKind[];
  credentials: Record<SecretKind, SecretState>;
}

export interface AwesomeSource {
  id: string;
  repo_full_name: string;
  display_name: string;
  image_url: string;
  summary_zh: string;
  summary_en: string;
  featured: boolean;
  sort_order: number;
  revision?: number;
  status?: string;
  last_synced_at?: string;
}

export interface ImportFinding {
  id: string;
  original: string;
  title?: string;
  status: "confirmed" | "needs_review" | "not_found";
  confidence: number;
  reason: string;
  repository: string | null;
  candidate: GitHubCandidate | null;
  candidates: GitHubCandidate[];
  selected: boolean;
}

export interface GitHubCandidate {
  fullName: string;
  htmlURL: string;
  description: string;
  stars: number;
  language: string | null;
  ownerAvatar: string;
  archived: boolean;
  readmeExcerpt: string;
  matchedBy: string;
}

export interface ActivityEntry {
  id: string;
  createdAt: string;
  environment: EnvironmentId;
  title: string;
  detail: string;
  outcome: "success" | "failed" | "running";
}
