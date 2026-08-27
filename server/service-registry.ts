/**
 * Starcat 服务能力白名单。
 *
 * 控制台只允许访问这里登记过的统计和动作；这比提供任意 URL/Method/Body
 * 的生产请求器更容易审计，也能阻止浏览器把 BFF 变成开放代理。
 */
import type { SecretKind, ServiceId } from "./types.js";

export interface StatDescriptor {
  id: string;
  label: string;
  path: string;
  pick?: string;
  auth: SecretKind;
  description: string;
}

export interface ActionDescriptor {
  id: string;
  label: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  auth: SecretKind;
  destructive: boolean;
  readOnly?: boolean;
  description: string;
  fields?: Array<{
    name: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
}

export interface ResourceDescriptor {
  id: string;
  label: string;
  path: string;
  auth: SecretKind;
  description: string;
}

export interface ServiceDescriptor {
  id: ServiceId;
  label: string;
  description: string;
  readOnly: boolean;
  stats: StatDescriptor[];
  resources: ResourceDescriptor[];
  actions: ActionDescriptor[];
}

export const serviceRegistry: Record<ServiceId, ServiceDescriptor> = {
  sharing: {
    id: "sharing",
    label: "Sharing",
    description: "分享短链与公开仓库预览",
    readOnly: false,
    stats: [
      {
        id: "total-shares",
        label: "Total shares",
        path: "/internal/stats",
        pick: "data.total_shares",
        auth: "apiKey",
        description: "当前已创建分享链接总数",
      },
      {
        id: "active-shares",
        label: "Active shares",
        path: "/internal/stats",
        pick: "data.active_shares",
        auth: "apiKey",
        description: "仍可访问的分享链接",
      },
      {
        id: "total-visits",
        label: "Total visits",
        path: "/internal/stats",
        pick: "data.total_visits",
        auth: "apiKey",
        description: "公开分享累计访问量",
      },
      {
        id: "created-7d",
        label: "Created 7d",
        path: "/internal/stats",
        pick: "data.created_7d",
        auth: "apiKey",
        description: "最近七天创建量",
      },
    ],
    resources: [
      {
        id: "recent-shares",
        label: "Recent shares",
        path: "/internal/shares?sort=recent&limit=50",
        auth: "apiKey",
        description: "最近创建的分享记录",
      },
      {
        id: "top-shares",
        label: "Top shares",
        path: "/internal/shares?sort=visits&limit=50",
        auth: "apiKey",
        description: "访问量最高的分享记录",
      },
    ],
    actions: [],
  },
  trending: {
    id: "trending",
    label: "Trending",
    description: "GitHub Trending 仓库与开发者数据",
    readOnly: false,
    stats: [
      {
        id: "daily",
        label: "Daily repos",
        path: "/internal/stats",
        pick: "data.repos.daily",
        auth: "apiKey",
        description: "Daily 桶真实记录数",
      },
      {
        id: "total",
        label: "Total repos",
        path: "/internal/stats",
        pick: "data.repos.total",
        auth: "apiKey",
        description: "三个周期桶的总记录数",
      },
      {
        id: "languages",
        label: "Languages",
        path: "/internal/stats",
        pick: "data.languages",
        auth: "apiKey",
        description: "语言分类数",
      },
      {
        id: "visible",
        label: "Visible repos",
        path: "/internal/stats",
        pick: "data.operational.visible_rows",
        auth: "apiKey",
        description: "可对客户端展示的仓库记录",
      },
      {
        id: "pending-enrich",
        label: "Pending enrich",
        path: "/internal/stats",
        pick: "data.operational.pending_enrich",
        auth: "apiKey",
        description: "等待 GitHub 元数据补全的记录",
      },
    ],
    resources: [
      {
        id: "daily-repos",
        label: "Daily repositories",
        path: "/api/v1/repos?since=daily&limit=50",
        auth: "apiKey",
        description: "Daily Trending 列表",
      },
      {
        id: "languages",
        label: "Languages",
        path: "/api/v1/languages",
        auth: "apiKey",
        description: "实际语言聚合",
      },
    ],
    actions: [
      {
        id: "sync-repos",
        label: "同步 repos",
        method: "POST",
        path: "/internal/sync/repos",
        auth: "apiKey",
        destructive: false,
        description: "同步三个周期的 Trending 仓库",
      },
      {
        id: "sync-languages",
        label: "刷新 languages",
        method: "POST",
        path: "/internal/sync/languages",
        auth: "apiKey",
        destructive: false,
        description: "重新生成语言列表",
      },
      {
        id: "force-enrich",
        label: "强制 enrich",
        method: "POST",
        path: "/internal/enrich/force",
        auth: "apiKey",
        destructive: true,
        description: "强制重做已有数据补全",
      },
    ],
  },
  weekly: {
    id: "weekly",
    label: "Weekly",
    description: "多来源项目发现与异步补全",
    readOnly: false,
    stats: [
      {
        id: "repos",
        label: "Repos",
        path: "/api/v1/repos?page=1&page_size=1",
        pick: "meta.total",
        auth: "apiKey",
        description: "聚合库可用仓库总量",
      },
      {
        id: "languages",
        label: "Languages",
        path: "/api/v1/repos/languages",
        pick: "meta.total",
        auth: "apiKey",
        description: "可筛选语言数量",
      },
      {
        id: "hellogithub",
        label: "HelloGitHub",
        path: "/api/v1/repos?page=1&page_size=1&source=hellogithub",
        pick: "meta.total",
        auth: "apiKey",
        description: "HelloGitHub 来源仓库数",
      },
      {
        id: "ai-intelligence",
        label: "AI intelligence",
        path: "/api/v1/repos?page=1&page_size=1&source=ai_intelligence",
        pick: "meta.total",
        auth: "apiKey",
        description: "AI 情报来源仓库数",
      },
      {
        id: "available",
        label: "Available repos",
        path: "/internal/stats",
        pick: "data.available_repos",
        auth: "apiKey",
        description: "仍可访问的仓库记录",
      },
      {
        id: "enriched",
        label: "Enriched repos",
        path: "/internal/stats",
        pick: "data.enriched_repos",
        auth: "apiKey",
        description: "已完成元数据补全的仓库",
      },
    ],
    resources: [
      {
        id: "sources",
        label: "Sources",
        path: "/internal/sources",
        auth: "adminKey",
        description: "来源配置与同步状态",
      },
      {
        id: "ingest-batches",
        label: "Ingest batches",
        path: "/internal/ingest-batches?limit=50",
        auth: "adminKey",
        description: "最近导入批次和队列状态",
      },
      {
        id: "recent-repos",
        label: "Recent repositories",
        path: "/api/v1/repos?page=1&page_size=50&sort=updated_at&order=desc",
        auth: "apiKey",
        description: "最近更新的聚合仓库",
      },
    ],
    actions: [
      {
        id: "sync-weekly",
        label: "同步 weekly",
        method: "POST",
        path: "/internal/sync/weekly",
        auth: "adminKey",
        destructive: false,
        description: "同步 Weekly 主来源",
      },
      {
        id: "sync-zread",
        label: "同步 zread",
        method: "POST",
        path: "/internal/sync/zread",
        auth: "adminKey",
        destructive: false,
        description: "同步 Zread 来源",
      },
      {
        id: "rebuild",
        label: "重建聚合",
        method: "POST",
        path: "/internal/rebuild-aggregates",
        auth: "adminKey",
        destructive: true,
        description: "重新构建 Weekly 聚合表",
      },
    ],
  },
  wiki: {
    id: "wiki",
    label: "Wiki",
    description: "外部文档站与 Wiki 可用性探测",
    readOnly: false,
    stats: [
      {
        id: "repositories",
        label: "Repositories",
        path: "/internal/stats",
        pick: "data.repositories",
        auth: "apiKey",
        description: "已探测仓库数",
      },
      {
        id: "probes",
        label: "Total probes",
        path: "/internal/stats",
        pick: "data.total_probes",
        auth: "apiKey",
        description: "文档来源探测记录",
      },
      {
        id: "expired",
        label: "Expired probes",
        path: "/internal/stats",
        pick: "data.expired_probes",
        auth: "apiKey",
        description: "等待刷新探测结果",
      },
      {
        id: "retryable",
        label: "Retryable",
        path: "/internal/stats",
        pick: "data.retryable",
        auth: "apiKey",
        description: "当前可重试错误",
      },
    ],
    resources: [
      {
        id: "probe-errors",
        label: "Probe errors",
        path: "/internal/probe-errors?limit=50",
        auth: "apiKey",
        description: "最近探测错误与重试状态",
      },
    ],
    actions: [
      {
        id: "sync-probe",
        label: "触发 probe sync",
        method: "POST",
        path: "/internal/sync/probe",
        auth: "apiKey",
        destructive: false,
        description: "触发待处理探测任务",
      },
      {
        id: "refresh-owner",
        label: "刷新 owner",
        method: "POST",
        path: "/internal/refresh/owner",
        auth: "apiKey",
        destructive: true,
        description: "刷新指定 GitHub owner 的探测缓存",
        fields: [
          {
            name: "owner",
            label: "GitHub owner",
            placeholder: "apple",
            required: true,
          },
        ],
      },
    ],
  },
  recommend: {
    id: "recommend",
    label: "Recommend",
    description: "相似仓库推荐服务",
    readOnly: false,
    stats: [
      {
        id: "cache-entries",
        label: "V1 cache entries",
        path: "/internal/stats",
        pick: "data.v1.cache.entries",
        auth: "apiKey",
        description: "SimRepo 兼容缓存条目",
      },
      {
        id: "cache-hits",
        label: "V1 cache hits",
        path: "/internal/stats",
        pick: "data.v1.cache.hits",
        auth: "apiKey",
        description: "本次进程缓存命中次数",
      },
      {
        id: "model-repos",
        label: "V2 model repos",
        path: "/internal/stats",
        pick: "data.v2.repositories",
        auth: "apiKey",
        description: "激活模型中的仓库数",
      },
      {
        id: "model-edges",
        label: "V2 edges",
        path: "/internal/stats",
        pick: "data.v2.recommendation_edges",
        auth: "apiKey",
        description: "激活模型推荐边数量",
      },
    ],
    resources: [
      {
        id: "model-state",
        label: "Model state",
        path: "/internal/stats",
        auth: "apiKey",
        description: "V1 缓存和 V2 激活模型状态",
      },
    ],
    actions: [],
  },
  discovery: {
    id: "discovery",
    label: "Discovery",
    description: "探索、热门、新发布与 Awesome 来源",
    readOnly: false,
    stats: [
      {
        id: "discover",
        label: "Discover repos",
        path: "/api/v1/discovery/summary",
        pick: "data.modes[mode=discover].total",
        auth: "apiKey",
        description: "发现模式仓库数",
      },
      {
        id: "popular",
        label: "Popular repos",
        path: "/api/v1/discovery/summary",
        pick: "data.modes[mode=popular].total",
        auth: "apiKey",
        description: "热门模式仓库数",
      },
      {
        id: "new-releases",
        label: "New releases",
        path: "/api/v1/discovery/summary",
        pick: "data.modes[mode=new_releases].total",
        auth: "apiKey",
        description: "新发布模式仓库数",
      },
      {
        id: "topics",
        label: "Topics",
        path: "/api/v1/discovery/topics",
        pick: "meta.total",
        auth: "apiKey",
        description: "主题定义数量",
      },
      {
        id: "catalog-repos",
        label: "Catalog repos",
        path: "/internal/stats",
        pick: "data.repositories.total",
        auth: "apiKey",
        description: "Discovery 目录仓库总量",
      },
      {
        id: "history-ready",
        label: "History ready",
        path: "/internal/stats",
        pick: "data.star_history.ready",
        auth: "apiKey",
        description: "已生成 Star History 的仓库",
      },
      {
        id: "awesome-published",
        label: "Awesome published",
        path: "/internal/stats",
        pick: "data.awesome.published",
        auth: "apiKey",
        description: "已发布 Awesome 来源",
      },
    ],
    resources: [
      {
        id: "sync-runs",
        label: "Sync runs",
        path: "/internal/sync-runs?limit=50",
        auth: "adminKey",
        description: "最近 Discovery 同步任务",
      },
      {
        id: "awesome-sources",
        label: "Awesome sources",
        path: "/internal/discovery/awesome/sources",
        auth: "adminKey",
        description: "Awesome 来源状态",
      },
      {
        id: "trending-candidates",
        label: "Trending candidates",
        path: "/internal/discovery/trending-candidates",
        auth: "adminKey",
        description: "Trending 候选诊断",
      },
    ],
    actions: [
      {
        id: "sync-incremental",
        label: "轻同步 discovery",
        method: "POST",
        path: "/internal/sync/discovery?mode=incremental",
        auth: "adminKey",
        destructive: false,
        description: "执行增量同步",
      },
      {
        id: "sync-full",
        label: "全量 discovery",
        method: "POST",
        path: "/internal/sync/discovery?mode=full",
        auth: "adminKey",
        destructive: true,
        description: "执行完整同步并清理陈旧数据",
      },
      {
        id: "candidates",
        label: "候选诊断",
        method: "GET",
        path: "/internal/discovery/trending-candidates",
        auth: "adminKey",
        destructive: false,
        readOnly: true,
        description: "读取 Trending 候选诊断",
      },
    ],
  },
};

/**
 * 从已登记的统计和动作推导服务实际需要的凭据。
 *
 * API Key 是所有服务的基础鉴权；Admin Key 只有某个白名单动作明确声明时
 * 才会暴露给配置页，避免 UI 凭空制造并不存在的密钥概念。
 */
export function credentialKindsForService(service: ServiceId): SecretKind[] {
  const descriptor = serviceRegistry[service];
  const kinds = new Set<SecretKind>(["apiKey"]);
  for (const item of [
    ...descriptor.stats,
    ...descriptor.resources,
    ...descriptor.actions,
  ]) {
    kinds.add(item.auth);
  }
  return [...kinds];
}

export function pickValue(input: unknown, expression?: string): unknown {
  if (!expression) return input;
  let current: unknown = input;
  for (const segment of expression.split(".")) {
    const selector = segment.match(/^([^[]+)\[([^=]+)=([^\]]+)]$/);
    if (selector) {
      const [, property, key, value] = selector;
      current = getProperty(current, property);
      if (!Array.isArray(current)) return undefined;
      current = current.find((item) => getProperty(item, key) === value);
      continue;
    }
    current = getProperty(current, segment);
  }
  return current;
}

function getProperty(value: unknown, property: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[property];
}
