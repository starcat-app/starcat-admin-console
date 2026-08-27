# 基础 Service 运营专项 Checklist

## 文档与契约

- [x] 详细设计覆盖六服务、调用指标、REST、控制台与安全边界
- [ ] `落地方案.md` 与最终实现一致
- [ ] 各服务 README 记录新增接口与配置
- [ ] 本地验证说明完整

## 公共指标能力

- [ ] `starcat-api-kit` 提供统一 metrics 中间件
- [ ] 指标 SQLite 聚合、保留和查询实现完成
- [ ] 指标接口与隐私约束测试完成

## 六个 Service

- [ ] Sharing 业务统计、数据视图与调用指标
- [ ] Trending 业务统计、数据视图与调用指标
- [ ] Weekly 业务统计、数据源/队列视图与调用指标
- [ ] Wiki 业务统计、错误视图与调用指标
- [ ] Recommend 模型/Serving/缓存统计、诊断与调用指标
- [ ] Discovery 数据覆盖/同步统计、数据视图与调用指标

## Admin Console

- [ ] BFF typed adapter 和观测聚合接口
- [ ] API Monitoring 全局页面
- [ ] 六服务 Overview/Data/Diagnostics/Operations/API 页面
- [ ] 图表、筛选、空态、失败态和自动刷新
- [ ] 浏览器不接触 Key 或任意上游请求参数

## 验证与交付

- [ ] 八个仓库单元测试和构建通过
- [ ] Admin Console Playwright E2E 通过
- [ ] 本地多服务链路验证通过
- [ ] 多轮审查报告已生成并修复
- [ ] 最终结果报告已生成
- [ ] 所有提交为本地中文 commit，未 push
