# 基础 Service 运营与接口调用统计详细设计

> 日期：2026-08-27  
> 状态：实施中  
> 范围：Sharing、Trending、Weekly、Wiki、Recommend、Discovery 与 Admin Console

## 1. 目标

本期把 Admin Console 的六个业务 Service 页面从“健康检查 + 少量标量”升级为可用于日常运营的控制面：

- 展示服务健康、业务规模、数据新鲜度、异常和最近任务；
- 通过固定、鉴权的 REST 接口查看业务数据与执行安全操作；
- 统一采集接口调用量、错误率和延迟，提供折线图、接口排行与状态分布；
- 保持 Test 直连六个本地服务、Production 经共享 Gateway + `X-SC-Svc` 的既有边界；
- Key 只存在于 BFF，浏览器不能提交任意 URL、Method、Header 或上游凭据。

## 2. 服务能力

| 服务 | 业务统计与数据 | 诊断与操作 |
|---|---|---|
| Sharing | 分享总数、有效/过期数、近期新增、访问量、热门与最近分享 | 按仓库查看分享活动、打开公开链接；不提供删除 |
| Trending | 日/周/月榜规模、语言覆盖、待补全、不可用仓库、最近抓取时间 | 榜单与开发者查询、同步榜单/语言、强制补全 |
| Weekly | 仓库、Issue/Event、来源、批次、队列状态与失败摘要 | 来源同步、批次查看、重建聚合；精选导入仍使用独立页面 |
| Wiki | 来源覆盖、探测状态、重试队列、HTTP 状态与最近错误 | 单仓库/批量探测、Owner 刷新与失败重试 |
| Recommend | v1/v2、当前模型、Serving 数据规模、缓存与结果覆盖 | 单仓库 v1/v2 对比、多正负样本查询；模型发布仍属于数据平台 |
| Discovery | 仓库、Release、榜单、分类覆盖、同步批次与 Star History 缓存 | Feed/Popular/New Release 查询、候选查看、增量/全量同步 |

Awesome 来源和 Curated Imports 保持专页，Service 页面只展示摘要并跳转，避免两套编辑入口。

## 3. 调用指标架构

六个服务统一依赖 `starcat-api-kit/metrics`。中间件在路由返回后记录聚合指标，不保存单次请求：

```text
HTTP request
  -> metrics middleware
  -> CORS / auth / handler
  -> in-memory minute bucket
  -> periodic SQLite UPSERT
  -> /internal/metrics/*
  -> Admin Console BFF fan-out
  -> charts and route ranking
```

每个服务使用独立的 `<service>-metrics.db`，与业务数据库分离。生产文件位于服务自己的持久化
`/data` Volume；本地默认位于业务数据库同级目录。公共包通过 `MetricStore` 隔离存储实现，未来迁移
PostgreSQL、VictoriaMetrics 或 ClickHouse 时保持 REST 和前端契约不变。

### 3.1 采集维度

- `service`、`instance_id`；
- UTC 时间桶与 `minute/hour/day` 粒度；
- Go 路由模板、HTTP Method；
- `public/client/internal/health` 流量分类；
- `2xx/3xx/4xx/5xx` 状态分类；
- 调用次数、错误次数、响应字节、总耗时、最大耗时和固定延迟直方图。

禁止保存 Authorization、API Key/Hash、IP、User-Agent、Query、请求体、响应体和真实路径参数。
`/internal/metrics/*` 不参与统计，避免控制台轮询污染数据；`/healthz` 单独归类，默认业务视图排除。

### 3.2 保留与聚合

| 粒度 | 保留时间 | 用途 |
|---|---:|---|
| minute | 7 天 | 1 小时与 24 小时精细曲线 |
| hour | 180 天 | 周、月、半年趋势 |
| day | 长期 | 年度与长期运营趋势 |

进程每 30 秒批量写入，异常退出最多损失当前刷新周期。后台维护任务把过期 minute/hour 数据滚动聚合
到更粗粒度；查询接口限制时间范围和最大点数，防止控制台生成无界扫描。

### 3.3 REST 契约

每个服务暴露只读、普通 Service API Key 鉴权的固定接口：

```http
GET /internal/metrics/summary?range=24h
GET /internal/metrics/timeseries?metric=requests&range=7d&route=&method=
GET /internal/metrics/routes?range=24h&sort=requests&limit=20
GET /internal/metrics/status-codes?range=24h
```

Admin Console BFF 提供聚合接口：

```http
GET /api/observability/summary
GET /api/observability/timeseries
GET /api/observability/services
GET /api/observability/routes
```

BFF 只接受枚举化 Service、Metric、Range、Route 和 Method；不接受上游 URL 或 Header。

## 4. 控制台信息架构

新增一级页面 **API Monitoring**：

- 总调用量、错误率、P95 延迟、在线服务数；
- 调用量与错误率折线图；
- P50/P95/P99 延迟折线图；
- 六服务调用量堆叠图；
- 状态码分布、热门接口、错误接口和慢接口排行；
- 1h/24h/7d/30d/180d、Service、Route、Method、流量分类筛选与自动刷新。

每个 Service 详情页包含：Overview、Data、Diagnostics、Operations、API 五类能力。图表使用 shadcn Chart
封装的 Recharts，复用现有主题 token；页面只渲染 BFF 归一化后的 DTO。

## 5. 安全与扩展边界

- 本期不新增公网部署、登录、RBAC、任意代理、任意 SQL、删除或清库；
- 只读统计使用 Service API Key，写操作继续使用已有 Admin Key 边界；
- 指标不是审计日志，不保存请求级明细；第三方额度统计需后续引入独立 `consumer_id`，不能用 Key Hash 代替身份；
- 当前 SQLite 方案针对单实例服务。多实例阶段替换 Store 并按 `instance_id` 汇总，不改变控制台接口；
- `starcat-api-kit` 先发布包含 metrics 的新版本，六服务再升级依赖，禁止长期提交本地 `replace`。

## 6. 验收标准

1. 六服务统一采集 route-template 级调用量、状态与延迟，指标重启后可恢复。
2. 六服务均提供真实业务统计、至少一个业务数据视图和安全诊断/操作入口。
3. Admin Console 可展示全局与单服务曲线、接口排行和状态分布。
4. Test/Production 路由、鉴权与凭据脱敏保持正确。
5. 所有 Go 单测、构建、Admin Console `pnpm check` 和 Playwright E2E 通过。
6. 文档、checklist、工程进度、审查报告与代码一致；所有提交仅保存在本地，不 push。
