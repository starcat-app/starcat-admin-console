# 基础 Service 发布部署结果报告

## 报告信息

- 完成时间：2026-08-27 20:12 CST
- 发布范围：`starcat-api-kit`、Sharing、Trending、Weekly、Wiki、Recommend、Discovery、Admin Console、聚合网关
- 生产部署范围：仅 `starcat-api` Fly App
- 最终状态：发布、部署与生产全链路验收通过

## 发布目标

将六个基础业务服务的运营接口与调用统计正式发布，并把生产部署收口到单一聚合网关。六个服务仓库继续独立版本管理，但 tag 不再触发各自的 Fly App 部署；Admin Console 保持本机运行，通过本地 BFF 访问生产聚合网关。

## 正式版本与合并记录

| 项目 | 版本 | Main 合并提交 | PR | GitHub Release |
|---|---:|---|---|---|
| starcat-api-kit | v0.3.0 | `95f62eb` | [#5](https://github.com/starcat-app/starcat-api-kit/pull/5) | [v0.3.0](https://github.com/starcat-app/starcat-api-kit/releases/tag/v0.3.0) |
| starcat-sharing-api | v2.2.0 | `814c864` | [#32](https://github.com/starcat-app/starcat-sharing-api/pull/32) | [v2.2.0](https://github.com/starcat-app/starcat-sharing-api/releases/tag/v2.2.0) |
| starcat-trending-api | v2.1.0 | `b0bda78` | [#29](https://github.com/starcat-app/starcat-trending-api/pull/29) | [v2.1.0](https://github.com/starcat-app/starcat-trending-api/releases/tag/v2.1.0) |
| starcat-weekly-api | v2.1.0 | `d137ff3` | [#20](https://github.com/starcat-app/starcat-weekly-api/pull/20) | [v2.1.0](https://github.com/starcat-app/starcat-weekly-api/releases/tag/v2.1.0) |
| starcat-wiki-api | v2.1.0 | `e57164f` | [#12](https://github.com/starcat-app/starcat-wiki-api/pull/12) | [v2.1.0](https://github.com/starcat-app/starcat-wiki-api/releases/tag/v2.1.0) |
| starcat-recommend-api | v2.1.0 | `5378d8d` | [#8](https://github.com/starcat-app/starcat-recommend-api/pull/8) | [v2.1.0](https://github.com/starcat-app/starcat-recommend-api/releases/tag/v2.1.0) |
| starcat-discovery-api | v2.1.0 | `2fbc8d1` | [#7](https://github.com/starcat-app/starcat-discovery-api/pull/7) | [v2.1.0](https://github.com/starcat-app/starcat-discovery-api/releases/tag/v2.1.0) |
| starcat-admin-console | v0.2.0 | `75aabfe` | [#5](https://github.com/starcat-app/starcat-admin-console/pull/5) | [v0.2.0](https://github.com/starcat-app/starcat-admin-console/releases/tag/v0.2.0) |
| starcat-api | v1.0.2 | `64f455e` | [#5](https://github.com/starcat-app/starcat-api/pull/5) | [v1.0.2](https://github.com/starcat-app/starcat-api/releases/tag/v1.0.2) |

`starcat-api` 的 v1.0.0、v1.0.1、v1.0.2 均按 `dev → PR → main → tag` 发布。v1.0.2 是当前生产版本，包含六服务正式版本注入。

## CI 与部署边界调整

- 删除六个业务服务仓库的 `.github/workflows/fly-deploy.yml`；
- 六服务 tag 只执行测试和 GitHub Release，不再独立部署 Fly App；
- Admin Console 只发布源码与 GitHub Release，不部署到公网；
- 聚合镜像从八个仓库已合并的 `origin/main` 干净 worktree 构建，未携带任何工作区未提交内容；
- Fly 生产部署命令只指定 `--app starcat-api`。

## 部署过程与问题处理

### v1.0.0 首次部署

首次启动失败，日志为：

```text
[gateway] init recommend failed: initialize metrics SQLite: create metrics directory: mkdir data: permission denied
```

根因是容器以非 root 用户运行，而指标库默认写入不可写的 `/app/data`。发现后立即取消异常部署，并恢复到原生产镜像：

```text
registry.fly.io/starcat-api:deployment-01M0TG47BNZSJYH22C5K15HEBV
```

回滚后健康检查恢复通过，原有 1 GB 持久化卷未变更。

### v1.0.1 持久化路径修复

六个服务的 metrics SQLite 分别改为 `/data/<service>-metrics.db`，全部写入 `starcat_api_data` Fly Volume。部署后六服务成功启动，指标数据可持久化。

### v1.0.2 版本一致性修复

v1.0.1 运行正常，但六服务 ping 仍显示 `0.0.0-dev`。v1.0.2 在聚合 Docker 构建时分别注入 Sharing `2.2.0` 和其余五服务 `2.1.0`，并用非 root 容器验证 Recommend、Sharing 能创建各自的 `/data` 指标库。

## 最终 Fly 生产状态

| 项目 | 结果 |
|---|---|
| Fly App | `starcat-api` |
| Fly Release | `v17`，状态 `complete` |
| Machine | `185de96f791908`，`started`，区域 `nrt` |
| 当前镜像 | `registry.fly.io/starcat-api:deployment-01M11HY0ZVVHZMN61WKMB31BMD` |
| 健康检查 | `servicecheck-00-http-8080` 为 `passing` |
| Volume | `vol_458j3e5ky32ln1q4` / `starcat_api_data` / 1 GB / 已挂载当前 Machine |
| 公网入口 | `https://starcat-api.fly.dev` |

`/healthz` 返回 `status: ok`，并列出 Recommend、Wiki、Sharing、Trending、Weekly、Discovery 六个服务。

## 生产全链路验收

Admin Console 本地 BFF 使用生产环境配置访问聚合网关，浏览器端未接触 API Key。验收结果如下：

| 服务 | Online | Authenticated | Ping 版本 | Stats | Resources | Actions |
|---|---|---|---:|---:|---:|---:|
| Sharing | 是 | 是 | 2.2.0 | 4 | 2 | 0 |
| Trending | 是 | 是 | 2.1.0 | 5 | 2 | 3 |
| Weekly | 是 | 是 | 2.1.0 | 6 | 3 | 3 |
| Wiki | 是 | 是 | 2.1.0 | 4 | 1 | 2 |
| Recommend | 是 | 是 | 2.1.0 | 4 | 1 | 0 |
| Discovery | 是 | 是 | 2.1.0 | 7 | 3 | 3 |

24 小时 observability 聚合中六服务均为 `ok: true`，均返回请求摘要、时间序列、路由排行和状态码分布；本次验收观测到的请求全部为 2xx。

生产业务数据也已实际读取，例如 Sharing 20 条分享与 102 次访问、Trending 343 条三周期记录、Weekly 4908 个仓库、Wiki 2970 个已探测仓库、Discovery 3503 个目录仓库。Recommend 当前模型仓库和边数量为 0，这是生产尚未发布训练 Serving Bundle 的数据状态，不是接口或部署故障。

## 旧独立 Fly App 核对

六个旧 App 的镜像和启停状态均与发布前一致，证明本次 tag 和部署没有触发独立发布：

| 旧 Fly App | 状态 | 保持不变的镜像 |
|---|---|---|
| starcat-sharing-api | started | `deployment-01M0S6EK5HY40R2QNT0VYBJFG2` |
| starcat-trending-api | stopped | `deployment-01KY1K72CS2A3S3T8JW2K39XGX` |
| starcat-weekly-api | stopped | `deployment-01KY1KGPEE1WZ27S2F684ZN0CR` |
| starcat-wiki-api | stopped | `deployment-01KY1KTZWR9S53FKE4QPW9EC2T` |
| starcat-recommend-api | stopped | `deployment-01KY1M1DH8WRFME40TK9EWHQRY` |
| starcat-discovery-api | started | `deployment-01M0S11NKSX10B5FGD1MASMZKX` |

## 测试与审查结果

- API Kit 与六服务：各仓库 `go test ./...`、`go vet ./...` 通过；tag 发布 CI 通过；
- Admin Console：42 个 Vitest、format、lint、typecheck、生产构建通过；Playwright 10 个用例通过；
- 聚合网关：PR 构建测试通过；本地真实 Docker 非 root 运行验证通过；Fly smoke check 与外部健康检查通过；
- 文档审查：专项工程进度、checklist、原完成结果报告与本报告已同步当前发布状态；
- 变更边界审查：Starcat 主仓库 `docs/功能实现总览.md` 未修改。

## 分支状态说明

Sharing、Trending、Weekly、Wiki、Recommend 的本地 `dev` 已 fast-forward 到对应发布合并提交。Discovery 本地 `dev` 保留一个并行产生的独有提交 `cba6e82 fix(awesome): 防止目录同步清理来源仓库数据`，与已发布的 `origin/dev` 各有一个独有提交；本次未 merge、rebase、reset 或覆盖该工作，且聚合镜像明确使用 `origin/main` 构建。

## 遗留问题

无本次发布或部署遗留问题。Discovery 的本地分叉属于另一项并行开发，应在对应需求中独立审查和合并。Recommend 生产训练数据尚未发布，后续应通过既定训练与 Serving Bundle 发布链路补充数据。

## 最终完成状态

**通过。** 正式版本全部发布，六服务独立部署入口已移除，生产只更新一个 `starcat-api` 聚合 Fly App；健康、版本、鉴权、业务统计、资源接口与调用统计全链路验收通过。
