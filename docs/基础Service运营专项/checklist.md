# 基础 Service 运营专项 Checklist

## 文档与契约

- [x] 详细设计覆盖六服务、调用指标、REST、控制台与安全边界
- [x] `落地方案.md` 与最终实现一致
- [x] 各服务 README 记录新增接口与配置
- [x] 本地验证说明完整

## 公共指标能力

- [x] `starcat-api-kit` 提供统一 metrics 中间件
- [x] 指标 SQLite 聚合、保留和查询实现完成
- [x] 指标接口与隐私约束测试完成

## 六个 Service

- [x] Sharing 业务统计、数据视图与调用指标
- [x] Trending 业务统计、数据视图与调用指标
- [x] Weekly 业务统计、数据源/队列视图与调用指标
- [x] Wiki 业务统计、错误视图与调用指标
- [x] Recommend 模型/Serving/缓存统计、诊断与调用指标
- [x] Discovery 数据覆盖/同步统计、数据视图与调用指标

## Admin Console

- [x] BFF typed adapter 和观测聚合接口
- [x] API Monitoring 全局页面
- [x] 六服务 Statistics/Data resources/Registered actions 分区
- [x] 图表、筛选、空态、失败态和自动刷新
- [x] 浏览器不接触 Key 或任意上游请求参数

## 验证与交付

- [x] 八个仓库单元测试和构建通过
- [x] Admin Console Playwright E2E 通过
- [x] 本地多服务链路验证通过
- [x] 多轮审查报告已生成并修复
- [x] 最终结果报告已生成
- [x] 所有提交为本地中文 commit，未 push
