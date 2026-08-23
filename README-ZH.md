# Starcat 管理控制台

<!-- starcat-promo:start -->
<div align="center">
<a href="https://starcat.ink"><img src="https://raw.githubusercontent.com/starcat-app/starcat-pro/main/banner.webp" width="100%" alt="Starcat" /></a>

<p><strong>这是 Starcat 配套服务、数据工作流、精选发布与 Awesome 来源管理的本地优先运营控制台。</strong></p>
<p>Starcat 是一款原生 macOS 应用，可以把 GitHub Stars 变成可搜索、可整理、可用 AI 追问的本地知识库。当前 1.4.0 支持 README 渲染、知识库 RAG、GitHub 通知、我的项目、全局与仓库洞察、macOS 桌面小组件、标签与私有笔记、Release 追踪、仓库健康度、AI 摘要、语义搜索、浏览器插件，以及 Alfred / uTools / Raycast 外部搜索，并提供多个可自部署 API。</p>

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
- 当前 Direct 版本: https://starcat.ink/downloads/Starcat-1.4.0-arm64.dmg
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

第一阶段只在管理员本机运行，规划职责包括：

- 展示 Starcat 配套 API 的健康状态与数据统计；
- 在页面上明确切换测试环境和生产环境；
- 分别配置各本地服务 URL、生产聚合网关与服务密钥；
- 执行刷新缓存、清空缓存、数据任务等明确建模的操作；
- 通过 Agent 分析粘贴文本，并联网与访问 GitHub 核验后导入精选项目；
- 管理 Discover 暴露的 Awesome **来源**，不维护内置 README 内容；
- 在高级设置中管理 Fly 环境变量与 Secrets。

完整边界、架构、阶段和验收标准见[落地方案](./docs/落地方案.md)。

## 当前状态

项目当前处于落地方案与视觉设计阶段。首版控制台视觉方向确认后，再加入 React 应用源码和
可运行命令。

## 安全边界

浏览器端不得获得服务 Key、AI Provider Key、GitHub Token 或 Fly 凭据。第一阶段由只绑定
本机回环地址的 BFF 持有凭据。生产环境允许写入，但破坏性或影响范围较大的操作仍需针对
本次动作展示影响并确认。

配置真实数据前请阅读 [SECURITY.md](./SECURITY.md) 与 [PRIVACY.md](./PRIVACY.md)。

## 本地开发

首个可执行脚手架完成时，将同步补充经过验证的安装、构建、测试和打包命令。第一阶段不包含
任何远程部署目标。

## 参与贡献

提交 Pull Request 前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 安全与支持

安全问题请按 [SECURITY.md](./SECURITY.md) 私下反馈。其它问题请根据
[SUPPORT.md](./SUPPORT.md) 选择正确渠道。

## License

MIT，详见 [LICENSE](./LICENSE)。
