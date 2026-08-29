# AGENTS.md

本文件约束 `starcat-admin-console` 内的 AI 协作与实现边界。

## 规则来源与仓库边界

- 根目录 `AGENTS.md` 是本仓库 AI 协作规则的唯一维护源。
- 本目录是独立 Git 仓库，拥有自己的分支、remote、提交和发布边界；不得把改动并入
  外层 Starcat 主仓库，也不得顺带修改相邻 `supports/*` 项目。
- 开工前在本仓库核对 `git status --short` 与当前分支，保留用户已有改动；未经明确要求
  不 commit、push、切分支或修改 remote。

## 工作方式

- 修改代码前先给出最小实现方案，等待 dong4j 明确确认。
- 第一阶段只实现本机运行，不新增远程部署、登录、RBAC 或公网暴露能力。
- 只修改当前需求直接涉及的文件，不顺手重构无关代码。
- 新增完整文件时补充模块说明；复杂逻辑解释为什么这样做以及关键安全约束。

## 产品边界

- 业务服务管理区只管理六个开源业务 API；闭源服务不得混入该区域的类型、配置、路由、页面或文档中。
- 数据平台是独立的本机运维区，只允许管理 Trainer 暴露的固定 BigQuery 动作与受控 SQL Lab；不得复用业务 API 的环境、密钥或服务配置。
- 测试环境连接各本地 API；生产环境连接聚合网关。
- 生产环境允许写入，不增加全局写入开关；破坏性或批量操作仍需逐次展示目标与影响。
- Awesome 只管理来源，不管理内置 README 条目。
- Agent 导入必须经过文本分析、受限联网核验、人工审阅和显式发布，禁止自动发布。
- Web 控制台验收前，不删除 Starcat App 的「精选发布台」或 `_local-admin`。

## 安全约束

- Key、Token、Fly 凭据只允许存在于本地 BFF，禁止进入浏览器存储、URL、日志和错误响应。
- Agent 识别模块不得持有 Weekly 管理密钥；识别与发布必须是两个独立能力。
- 本地服务默认只绑定 `127.0.0.1`，并校验 Host 与 Origin。
- 写入结果不明确时必须复用原请求 payload 与 idempotency key，禁止盲目重试创建重复数据。

## 技术与验证

- 前端使用 React、TypeScript、Vite 与 shadcn/ui；优先使用 shadcn 组件和语义化主题 token。
- 本地 BFF 采用 Node.js 运行时，所有外部 API 访问通过类型化 adapter 收口。
- `src/` 是浏览器 UI，`server/` 是只绑定本机的 BFF 与受控运维 adapter，`tests/` 放
  Playwright 和前端测试，`docs/` 记录已确认的产品、数据平台与安全设计。
- 单元测试覆盖环境路由、密钥脱敏、权限边界与数据转换；Playwright 覆盖关键运营流程。
- 常规质量门禁运行 `pnpm check`；需要验收完整运营流程时再运行
  `pnpm exec playwright install chromium && pnpm test:e2e`。
- 实现完成后分别报告构建、自动化测试和人工浏览器验收结果，不能互相替代。

## 外部副作用禁令

- 未经 dong4j 针对本次操作明确授权，不得触发生产或测试服务写入、Fly secrets/部署、
  Awesome 发布、Agent 导入发布、BigQuery 查询或下载任务，以及数据平台 Job。
- 不得擅自运行 `pnpm data-platform:up` / `pnpm data-platform:down` 改变本机容器状态；
  `pnpm dev`、`pnpm start` 等长驻进程也只在任务确有需要时启动，并明确说明影响。
- 只读页面验收不能替代写操作授权；即使 UI 已提供确认框，Agent 仍须在执行前获得本次
  明确授权。
