# Starcat Admin Console 视觉概念

> 状态：视觉方向已确认；总览和环境配置图由当前本地实现直接截取。

## 概念稿

- [`overview.png`](./overview.png)：六个开源业务服务的总览和健康状态。
- [`curated-imports.png`](./curated-imports.png)：Agent 线索分析、联网核验与证据审阅。
- [`awesome-sources-production.png`](./awesome-sources-production.png)：生产环境下的 Awesome 来源列表与编辑抽屉。
- [`environment-profiles.png`](./environment-profiles.png)：六个本地服务 URL、真实凭据能力和环境路由提示。

图中的数值、日期、版本号和仓库示例只用于说明布局，不代表真实数据或版本承诺。实现时由真实
API 或明确标记的开发 fixture 提供。

## 视觉方向

- 桌面优先的开发者工具界面，采用深色导航栏与纯白内容画布。
- 信息结构以开放表格、列表、轨道和编辑抽屉为主，避免把所有内容装进独立 Card。
- Test 使用 cobalt blue；Production 使用 amber-red，并始终配合文字说明，不能只依赖颜色。
- 无渐变、无玻璃拟态、无装饰性插画；边框 1px、圆角约 8–10px、阴影接近零。
- 内容字体使用中性 sans-serif；正文与控件保持 13–14px 的紧凑但可读密度。

## 初始设计 Token

最终色值需要在概念确认后通过实际图片取样收口，下面只定义语义角色：

| Token | 用途 |
|---|---|
| `background` | 纯白主画布 |
| `sidebar` | 接近黑色的冷调深灰 |
| `foreground` | 标题与主要内容 |
| `muted-foreground` | 描述、时间和辅助信息 |
| `border` | 表格、输入框和区域分隔线 |
| `primary` | Test 状态、选中态与主操作 |
| `success` | 在线、已确认、完成 |
| `warning` | Production 提示、待审阅、部分异常 |
| `destructive` | 删除、同步错误和不可逆动作 |

## 组件族

- App shell：`Sidebar`、`TopBar`、`EnvironmentSwitcher`、`EnvironmentStatus`。
- 数据展示：`MetricBand`、`ServiceTable`、`ActivityTimeline`、`StatusBadge`。
- Agent 工作台：`ImportStepper`、`ClueInput`、`EvidenceRow`、`EvidencePanel`、`ReviewBar`。
- Awesome 管理：`SourceTable`、`SourceFilters`、`SourceEditorSheet`。
- 配置：`ProfileTabs`、`ServiceConnectionRow`、`SecretStatus`、`ProfileSummary`。
- 操作反馈：`ActionConfirmDialog`、`OperationResult`、`Toast`。

## 交互约束

- 左侧导航任一时刻只有一个选中项。
- 环境切换后清空环境相关查询缓存，草稿不能静默带到另一环境。
- Production 写入不受全局开关阻断，但页面和确认层必须重复展示生产环境。
- 浏览器只显示 Key 是否已配置和不可逆指纹，绝不回显真实值。
- Agent 的识别与发布分属不同步骤；证据审阅阶段不能直接发布。
- Awesome 页面只编辑来源对象，不出现 README 或内置项目条目编辑器。
