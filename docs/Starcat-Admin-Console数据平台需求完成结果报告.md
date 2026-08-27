# Starcat Admin Console 数据平台需求完成结果报告

## 项目目标

在现有 `starcat-admin-console` 中实现一个独立于六个业务 API 的本机数据平台工作台，使管理员
可以从 Web 页面查看 BigQuery 月度额度、管理 WatchEvent / PushEvent 下载任务、输入只读 SQL
进行数据验证，并通过 PostgreSQL 审计固定运维任务；同时把 T0 上的既有 Raw 原地登记为
Dataset Catalog，按 Dataset、Partition 和 Storage 维度运维。

## 完成内容

### 1. 数据平台控制面

- 新增 PostgreSQL 17 Catalog，只绑定 `127.0.0.1:55432`。
- 新增固定 Action Registry 与串行 JobRunner。
- 新增 config、overview、downloads、SQL dry-run / query、jobs、result、cancel BFF 路由。
- 子进程使用 `shell: false`、固定 executable / argv、白名单环境、超时和输出上限。
- BFF 重启会中断未完成 Job、清除瞬时结果标识；数据库短暂不可用后可由下一次请求重试。

### 2. BigQuery SQL Lab

- 只允许单条 `SELECT` / `WITH ... SELECT`。
- 首期只允许读取 `githubarchive` 公共数据集。
- 正式查询前必须 dry run，并绑定规范化 SQL hash 与同一预算。
- 单次 billed bytes 上限 10 GiB；结果上限 200 行、2 MiB。
- SQL 通过 `0600` 临时文件传给 Trainer，并在 success / failure / timeout / cancel 后删除。
- 查询结果只在 BFF 内存保留 10 分钟，不进入 Catalog、URL 或浏览器存储。

### 3. 下载任务管理

- WatchEvent / PushEvent 脚本支持结构化 `start|stop|restart|status --json`。
- JSON 状态不包含真实数据目录或日志路径。
- 页面展示进程状态、日期范围、分区进度、最后分区和 checkpoint 预计扫描量。
- Web 动作有二次确认，继续复用 Trainer 的 screen、checkpoint、外接磁盘保护和额度监控。
- 两类任务共享同一 GCP Project quota；控制台只查询一次并复用，状态缓存 30 秒。

### 4. Web 工作台

- 新增侧边栏 `Data platform → BigQuery operations`。
- 数据平台页面隐藏 Test / Production 开关，显示明确的 `Local data platform` 标识。
- 实现月度额度面板、双下载任务卡片、SQL 编辑器、dry run 摘要、结果表和 Recent jobs。
- Job 表展示状态、动作、计费摘要与时间，可取消 queued / running 任务。

### 5. Dataset Catalog

- PostgreSQL 通过版本化 migration 新增 Dataset、Partition、Watermark、Storage、Artifact、
  Deployment 控制表，不存放 Raw 明细。
- Trainer 增加 WatchEvent / PushEvent 既有 Raw 只读检查命令，逐分区复核 Parquet footer、
  schema、行数和 SHA-256，不移动或复制文件。
- BFF 只开放两项固定登记 Action；真实 workspace 来自本机配置，浏览器不能提交路径或 argv。
- 写入前交叉校验分区数量、状态计数、统计合计、日期范围、逻辑 URI 归属与唯一性，再以单个
  PostgreSQL 事务替换 Dataset 快照。
- 新增 Datasets、Partitions、Storage 页面，支持覆盖率摘要、状态/日期筛选、分页和容量水位。

## 数据流向

```text
浏览器 /data-platform
  -> 同源 Hono BFF /api/data-platform/*
    -> PostgreSQL data_platform_jobs（仅 hash、状态、计费摘要）
    -> 固定 Action JobRunner
      -> Trainer CLI SQL Lab -> BigQuery githubarchive
      -> WatchEvent / PushEvent 固定脚本 -> screen + checkpoint -> /Volumes/T0
      -> Trainer lake inspect -> 既有 Raw（只读）
        -> PostgreSQL Dataset / Partition / Watermark / Storage Catalog
```

SQL 正文只经过浏览器内存、BFF 内存和临时文件；查询结果只从 Trainer stdout 进入 BFF 瞬时
内存，再返回当前浏览器。下载数据仍只保存在既有 `/Volumes/T0/Starcat/bigquery/*` raw zone，
控制台不会复制或迁移 Parquet。

## 功能清单

| 功能 | 状态 |
|---|---|
| PostgreSQL Job Catalog | 完成 |
| 固定下载 Action | 完成 |
| JSON 下载状态 | 完成 |
| 月度免费额度展示 | 完成 |
| SQL dry run | 完成 |
| SQL hash / 预算绑定执行 | 完成 |
| 有界查询结果表 | 完成 |
| Job 取消与重启恢复 | 完成 |
| 本机数据平台 Web 页面 | 完成 |
| 版本化 Dataset Catalog | 完成 |
| WatchEvent / PushEvent 既有 Raw 原地登记 | 完成 |
| Dataset Inventory 整体一致性校验 | 完成 |
| Datasets / Partitions / Storage 页面 | 完成 |
| 使用文档、安全与隐私说明 | 完成 |

## 文档同步情况

- Starcat：数据平台总体设计与开发前决策已同步。
- Admin Console：README 中英文、落地方案、本地使用指南、Security、Privacy、Changelog、
  Third-party notices 已同步。
- Trainer：README、使用说明、实施清单和 Changelog 已同步。
- 主仓库 `docs/功能实现总览.md` 未修改，因为当前没有 dong4j 的专项写入授权。

## 测试情况

### 自动化

- Admin Console：38 个 Vitest 通过；Prettier、ESLint、TypeScript、生产构建通过。
- Admin Console Playwright：8 / 8 通过。
- Trainer：101 个 pytest 通过；Ruff、mypy 通过。

### 真实链路

- PostgreSQL 17 容器健康，Catalog 创建和重启恢复验证通过。
- ADC 与 BigQuery quota 查询通过。
- `SELECT 1 AS ok`：dry run 0 B，正式查询 processed 0 B、billed 0 B，返回 `ok = 1`。
- WatchEvent：最终审查快照为 1994 / 3890，running。
- PushEvent：最终审查快照为 64 / 3890，running。
- 真实浏览器已验证额度、下载状态、dry run、Execute、结果表和 Recent jobs。
- WatchEvent Catalog：3097 ready、0 failed、793 missing，共 3890 分区；watermark 为 2024-06-23。
- PushEvent Catalog：401 ready、0 failed、3489 missing，共 3890 分区；watermark 为 2017-02-04。
- 两个 Dataset 合计 587,996,965 行级事件由 Catalog 记录；PostgreSQL 分区计数与状态汇总逐项一致。
- Storage 快照：约 931 GiB 容量、920 GiB 可用；Catalog 只记录
  `storage://primary-data-volume`，未记录真实卷路径。
- 真实浏览器已验证 Datasets、Partitions、Storage 页面及逻辑 URI 脱敏。

## 审查轮次

1. 第 1 轮：发现初始化失败不可恢复、重启后瞬时结果标识过期两个中等级问题，均已修复。
2. 第 2 轮：验证 `.env.local` 启动和真实 PostgreSQL 恢复，无新增问题。
3. 第 3 轮：三仓库、全量测试、E2E 和实时下载最终一致性审查，无遗留问题。
4. 第 4 轮：发现 Inventory 缺少整体一致性校验，已修复并新增回归测试。
5. 第 5 轮：全量构建、E2E、PostgreSQL 计数、路径脱敏与真实 Action 复审，无新增问题。
6. 第 6 轮：发现总体设计与本结果报告未同步当前逻辑 URI、两路登记和测试结果，已修复。

审查报告位于 [`审查报告`](./审查报告/) 目录。

## 本地提交

### Starcat

- `43b11e37 docs(data-platform): 补充受控 BigQuery SQL Lab 方案`
- `cd58f9f docs(data-platform): 对齐 Dataset 逻辑 URI 与登记动作`

### starcat-recsys-trainer

- `742a59e feat(bigquery): 增加受控 SQL Lab 查询能力`
- `227e3b9 feat(bigquery): 输出下载任务结构化状态`
- `c24f24c fix(bigquery): 避免控制台重复查询月度额度`
- `2004def docs(bigquery): 说明控制台 SQL Lab 与任务接口`
- `da1f146 feat(data-platform): 支持既有 BigQuery Raw 只读登记`

### starcat-admin-console

- `03184eb feat(data-platform): 建立本机任务控制面`
- `c7ab6c5 fix(data-platform): 复用 BigQuery 任务状态与额度`
- `a43a1f4 feat(data-platform): 增加 BigQuery 运维工作台`
- `b91f154 docs(data-platform): 补充本机数据平台使用说明`
- `c519b08 fix(data-platform): 修复控制面重启恢复状态`
- `8e03010 docs(review): 记录数据平台第二轮审查结果`
- `db026bf feat(data-platform): 支持既有 Raw 数据登记 Catalog`
- `8027841 feat(data-platform): 新增 Dataset 分区与存储运维页面`
- `2b1bed6 fix(data-platform): 拒绝不一致的 Dataset 登记快照`
- `ce49911 docs(review): 记录 Dataset Catalog 第二轮审查结果`

全部为本地提交，未 push。

## 遗留问题

无。

以下属于明确的本期边界，不是遗留缺陷：不支持公网部署、登录 / RBAC、多用户、任意 SQL
网关、任意命令执行或云端大数据存储。

## 最终完成状态

**完成。** 代码、文档、测试和工程进度一致，六轮审查无未修复问题；控制台已能在本机完整
操作 BigQuery 验证链路，并在不干扰现有下载任务、不复制 Raw 的前提下登记和查看
Dataset、Partition 与 Storage 状态。
