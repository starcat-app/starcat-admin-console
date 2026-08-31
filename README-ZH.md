# Starcat 管理控制台

<!-- starcat-promo:start -->
<div align="center">
<a href="https://starcat.ink"><img src="https://raw.githubusercontent.com/starcat-app/starcat-pro/main/banner.webp" width="100%" alt="Starcat" /></a>

<p><strong>这是 Starcat 配套服务、数据工作流、精选发布与 Awesome 来源管理的本地优先运营控制台。</strong></p>
<p>Starcat 是一款原生 macOS 应用，可以把 GitHub Stars 变成可搜索、可整理、可用 AI 追问的本地知识库，并通过桌面客户端、插件、CLI 与可自部署服务组成完整生态。</p>

<a href="https://github.com/starcat-app/homebrew-starcat"><img src="https://img.shields.io/badge/Install%20with-Homebrew-FBBF24?style=for-the-badge&logo=homebrew&logoColor=white" width="220" alt="Install with Homebrew"/></a>
<br/>
<sub><a href="./README.md">English</a></sub>
</div>

<div align="center">
<a href="https://starcat.ink"><img src="https://img.shields.io/badge/website-starcat.ink-38BDF8?style=flat&color=blue" alt="website"/></a>
<a href="https://github.com/starcat-app/starcat-pro"><img src="https://img.shields.io/badge/support-starcat--pro-lightgrey.svg?style=flat&color=blue" alt="support"/></a>
<a href="https://github.com/starcat-app/homebrew-starcat"><img src="https://img.shields.io/badge/install-homebrew-lightgrey.svg?style=flat&color=blue" alt="homebrew"/></a>
<a href="https://github.com/starcat-app/starcat-localization"><img src="https://img.shields.io/badge/localization-open-lightgrey.svg?style=flat&color=blue" alt="localization"/></a>
</div>

<div align="center">
<img width="900" src="https://raw.githubusercontent.com/starcat-app/starcat-pro/main/main.webp" alt="Starcat main window"/>
</div>

**首选 Homebrew 安装：**

```bash
brew tap starcat-app/starcat
brew trust starcat-app/starcat
brew install --cask starcat
```

**相关链接：**

- 官网与下载: https://starcat.ink
- Mac App Store: 搜索 Starcat for GitHub
- 公开支持与发布说明: https://github.com/starcat-app/starcat-pro
- Starcat App Homebrew tap: https://github.com/starcat-app/homebrew-starcat
- CLI / MCP: [starcat-cli](https://github.com/starcat-app/starcat-cli) / [Homebrew tap](https://github.com/starcat-app/homebrew-starcat-cli)
- AI Agent Skill: https://github.com/starcat-app/starcat-skill
- 浏览器插件: [Chrome](https://github.com/starcat-app/starcat-chrome-plugin) / [Safari](https://github.com/starcat-app/starcat-safari-plugin)
- 启动器集成: [Alfred](https://github.com/starcat-app/starcat-alfred-workflow) / [uTools](https://github.com/starcat-app/starcat-utools-plugin) / [Raycast](https://github.com/starcat-app/starcat-raycast-extension)
- 官方文档: https://github.com/starcat-app/starcat-docs
- 官网源码: https://github.com/starcat-app/starcat-site
- 本地化: https://github.com/starcat-app/starcat-localization

**可自部署支撑 API：**

- [starcat-sharing-api](https://github.com/starcat-app/starcat-sharing-api)
- [starcat-trending-api](https://github.com/starcat-app/starcat-trending-api)
- [starcat-weekly-api](https://github.com/starcat-app/starcat-weekly-api)
- [starcat-wiki-api](https://github.com/starcat-app/starcat-wiki-api)
- [starcat-recommend-api](https://github.com/starcat-app/starcat-recommend-api)
- [starcat-discovery-api](https://github.com/starcat-app/starcat-discovery-api)
<!-- starcat-promo:end -->

<sub><a href="./README.md">English</a></sub>

面向 Starcat 配套服务、数据工作流与精选发布的本地优先运营控制台。

## 项目说明

`starcat-admin-console` 是 Starcat 生态中的独立开源项目。它计划替代原始的
`starcat-site/_local-admin` 页面，并在功能对齐且验收通过后，承接 Starcat macOS App
内现有「精选发布台」的职责。

第一阶段只在管理员本机运行，职责包括：

- 展示 Starcat 配套 API 的健康状态与数据统计；
- 展示六服务调用量、错误率、延迟曲线与路由排行；
- 在页面上明确切换测试环境和生产环境；
- 分别配置各本地服务 URL、生产聚合网关与服务密钥；
- 执行刷新缓存、清空缓存、数据任务等明确建模的操作；
- 通过 Agent 分析粘贴文本，并联网与访问 GitHub 核验后导入精选项目；
- 管理 Discover 暴露的 Awesome **来源**，不维护内置 README 内容；
- 在高级设置中管理 Fly 环境变量与 Secrets。
- 在隔离的本机数据平台区查看 BigQuery 月度额度、管理 WatchEvent / PushEvent 下载任务，并通过受控 SQL Lab 验证 `githubarchive` 数据。

完整边界、架构、阶段和验收标准见[落地方案](./docs/落地方案.md)。

## 当前状态

第一阶段本地控制台已经可以运行，现已包含 React/shadcn 工作区、明确的测试/生产环境路由、
白名单化服务统计与运维动作、Agent 辅助精选导入、Awesome 来源管理、连接与密钥配置、
Fly 应用设置、六服务只读数据视图与 API Monitoring，以及由 PostgreSQL Catalog 和 Trainer 固定动作驱动的本机数据平台。
数据平台的真实 ADC、下载状态、dry run、零扫描查询和浏览器链路已于 2026-08-27 验证通过。

![Starcat Admin Console 总览](./docs/design/overview.png)

## 安全边界

浏览器端不得获得服务 Key、AI Provider Key、GitHub Token 或 Fly 凭据。第一阶段由只绑定
本机回环地址的 BFF 持有凭据。生产环境允许写入，但破坏性或影响范围较大的操作仍需针对
本次动作展示影响并确认。

配置真实数据前请阅读 [SECURITY.md](./SECURITY.md) 与 [PRIVACY.md](./PRIVACY.md)。

## 本地开发

需要 Node.js 22+ 与 pnpm 11：

```bash
corepack enable
pnpm install
pnpm dev
```

浏览器打开 `http://127.0.0.1:5173`。Vite 会把 `/api` 转发到
`http://127.0.0.1:8787` 的本地 BFF。配置默认写入
`~/.config/starcat-admin-console`；密钥原文只保存在 BFF 的 secrets 文件中。开发和生产启动
命令都会在文件存在时自动读取被 Git 忽略的 `.env.local`。

构建并运行本地生产包：

```bash
pnpm build
pnpm start
```

然后打开 `http://127.0.0.1:8787`。

验证命令：

```bash
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

仅在需要覆盖运行路径时复制 `.env.example`。启用 BigQuery 数据平台时，按
[数据平台本地使用指南](./docs/数据平台本地使用指南.md) 启动 PostgreSQL、配置 Trainer 与
GCP ADC。第一阶段仍不包含远程部署目标。

## 本机数据平台

侧边栏 **Data platform → BigQuery operations** 是独立本机运维区，不受 Test / Production
业务环境切换影响。当前支持：

- 显示 BigQuery 月度免费额度、WatchEvent 与 PushEvent 分区进度；
- 通过确认框触发下载脚本的 `start`、`stop`、`restart`，继续复用 screen、checkpoint、
  外接磁盘保护和后台额度监控；
- 在 SQL Lab 输入单条 `SELECT` / `WITH ... SELECT`，先 dry run，再以相同 SQL hash 和预算执行；
- 展示最多 200 行、2 MiB 的临时结果，并在 PostgreSQL 中保留不含 SQL 正文的 Job 审计元数据。
- 在 Partitions 页对照 Catalog 快照与实时下载进度，识别快照落后并通过固定只读动作重新登记。

SQL Lab 首期只允许读取 `githubarchive` 公共数据集，单次查询预算上限为 10 GiB。SQL 只存在于
浏览器内存、BFF 内存和执行期间的 `0600` 临时文件；结果仅在 BFF 内存保留 10 分钟，不写入
PostgreSQL Catalog、URL 或浏览器存储。

## 配置说明

从控制台侧边栏进入 **Profiles**。凭据原文只写入本地 BFF，保存后浏览器无法读取。

| 环境 | 服务路由 | API 凭据 | Admin 凭据 |
|---|---|---|---|
| Test | 六个独立本地 URL（默认 `127.0.0.1:5001` 至 `:5006`） | 每个服务分别配置 API Key | 仅 Weekly 与 Discovery |
| Production | 单一 gateway URL，通过 `X-SC-Svc` 选择服务 | 六个服务共享一把 API Key | 仅 Weekly 与 Discovery |

服务鉴权契约刻意保持最小范围：

| 服务 | 默认 Test URL | API Key 用途 | 独立 Admin Key |
|---|---|---|---|
| Sharing | `http://127.0.0.1:5001` | 健康检查、ping 与统计 | 无 |
| Trending | `http://127.0.0.1:5002` | API 与 `/internal/*` 操作 | 无 |
| Weekly | `http://127.0.0.1:5003` | 公开 API 与统计 | 有，用于发布和 `/internal/*` 操作 |
| Wiki | `http://127.0.0.1:5004` | API 与 `/internal/*` 操作 | 无 |
| Recommend | `http://127.0.0.1:5005` | 当前控制台 API 访问 | 无 |
| Discovery | `http://127.0.0.1:5006` | 公开 API 与统计 | 有，用于 Awesome CRUD 和 `/internal/*` 操作 |

Agent 设置默认复用本机已登录的 Codex CLI，也可切换到 Claude Code。BFF 使用无状态、只读
子进程获得结构化结果，再通过 GitHub API 逐个复核返回的 `owner/repo`，通过后才进入人工审阅
列表。原有 OpenAI-compatible Base URL、模型和 Agent API Key 收进可选兼容模式；GitHub Token
仅用于提高仓库核验额度。Fly 设置使用 Fly Token，并可通过 `STARCAT_SUPPORTS_DIR` 定位相邻
服务仓库。运行路径覆盖项见 [`.env.example`](./.env.example)；上游服务凭据必须通过页面录入，
不写入环境变量文件。

## 参与贡献

提交 Pull Request 前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 安全与支持

安全问题请按 [SECURITY.md](./SECURITY.md) 私下反馈。其它问题请根据
[SUPPORT.md](./SUPPORT.md) 选择正确渠道。

## License

MIT，详见 [LICENSE](./LICENSE)。第三方开源组件致谢见
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
