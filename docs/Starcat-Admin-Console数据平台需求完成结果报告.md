# Starcat Admin Console 数据平台需求完成结果报告

## 项目目标

在现有 `starcat-admin-console` 中实现一个独立于六个业务 API 的本机数据平台工作台，使管理员
可以从 Web 页面查看 BigQuery 月度额度、管理 WatchEvent / PushEvent 下载任务、输入只读 SQL
进行数据验证，并通过 PostgreSQL 审计固定运维任务。

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

## 数据流向

```text
浏览器 /data-platform
  -> 同源 Hono BFF /api/data-platform/*
    -> PostgreSQL data_platform_jobs（仅 hash、状态、计费摘要）
    -> 固定 Action JobRunner
      -> Trainer CLI SQL Lab -> BigQuery githubarchive
      -> WatchEvent / PushEvent 固定脚本 -> screen + checkpoint -> /Volumes/T0
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
| 使用文档、安全与隐私说明 | 完成 |

## 文档同步情况

- Starcat：数据平台总体设计与开发前决策已同步。
- Admin Console：README 中英文、落地方案、本地使用指南、Security、Privacy、Changelog、
  Third-party notices 已同步。
- Trainer：README、使用说明、实施清单和 Changelog 已同步。
- 主仓库 `docs/功能实现总览.md` 未修改，因为当前没有 dong4j 的专项写入授权。

## 测试情况

### 自动化

- Admin Console：36 个 Vitest 通过；Prettier、ESLint、TypeScript、生产构建通过。
- Admin Console Playwright：7 / 7 通过。
- Trainer：99 个 pytest 通过，覆盖率 87%；Ruff、mypy 通过。

### 真实链路

- PostgreSQL 17 容器健康，Catalog 创建和重启恢复验证通过。
- ADC 与 BigQuery quota 查询通过。
- `SELECT 1 AS ok`：dry run 0 B，正式查询 processed 0 B、billed 0 B，返回 `ok = 1`。
- WatchEvent：最终审查快照为 1994 / 3890，running。
- PushEvent：最终审查快照为 64 / 3890，running。
- 真实浏览器已验证额度、下载状态、dry run、Execute、结果表和 Recent jobs。

## 审查轮次

1. 第 1 轮：发现初始化失败不可恢复、重启后瞬时结果标识过期两个中等级问题，均已修复。
2. 第 2 轮：验证 `.env.local` 启动和真实 PostgreSQL 恢复，无新增问题。
3. 第 3 轮：三仓库、全量测试、E2E 和实时下载最终一致性审查，无遗留问题。

审查报告位于 [`审查报告`](./审查报告/) 目录。

## 本地提交

### Starcat

- `43b11e37 docs(data-platform): 补充受控 BigQuery SQL Lab 方案`

### starcat-recsys-trainer

- `742a59e feat(bigquery): 增加受控 SQL Lab 查询能力`
- `227e3b9 feat(bigquery): 输出下载任务结构化状态`
- `c24f24c fix(bigquery): 避免控制台重复查询月度额度`
- `2004def docs(bigquery): 说明控制台 SQL Lab 与任务接口`

### starcat-admin-console

- `03184eb feat(data-platform): 建立本机任务控制面`
- `c7ab6c5 fix(data-platform): 复用 BigQuery 任务状态与额度`
- `a43a1f4 feat(data-platform): 增加 BigQuery 运维工作台`
- `b91f154 docs(data-platform): 补充本机数据平台使用说明`
- `c519b08 fix(data-platform): 修复控制面重启恢复状态`
- `8e03010 docs(review): 记录数据平台第二轮审查结果`

全部为本地提交，未 push。

## 遗留问题

无。

以下属于明确的本期边界，不是遗留缺陷：不支持公网部署、登录 / RBAC、多用户、任意 SQL
网关、任意命令执行或云端大数据存储。

## 最终完成状态

**完成。** 代码、文档、测试和工程进度一致，三轮审查无未修复问题；控制台已能在本机完整
操作 BigQuery 验证链路，并在不干扰现有下载任务的前提下展示和控制数据采集状态。
