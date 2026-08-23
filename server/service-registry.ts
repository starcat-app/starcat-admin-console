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

export interface ServiceDescriptor {
  id: ServiceId;
  label: string;
  description: string;
  readOnly: boolean;
  stats: StatDescriptor[];
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
    stats: [],
    actions: [
      {
        id: "sync-probe",
        label: "触发 probe sync",
        method: "POST",
        path: "/internal/sync/probe",
        auth: "adminKey",
        destructive: false,
        description: "触发待处理探测任务",
      },
      {
        id: "refresh-owner",
        label: "刷新 owner",
        method: "POST",
        path: "/internal/refresh/owner",
        auth: "adminKey",
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
    stats: [],
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
  license: {
    id: "license",
    label: "License",
    description: "Direct 分发与授权链路",
    readOnly: true,
    stats: [],
    actions: [],
  },
};

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
