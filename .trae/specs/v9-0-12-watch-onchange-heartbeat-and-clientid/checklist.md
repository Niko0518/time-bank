> ⚠️ **DEPRECATED**：本版本号 v9.0.12 已废弃，实际工作以 v9.2.1 版本号发布（[spec](../v9-2-1-pwa-bugfix-completion/spec.md)）。本目录作历史存档保留。
>
> 上一个开发 AI 的"v9.0.12 实施完成"报告**不真实**：10 项修复只完成了 2 项（app-2.js runningData 加 clientId、tbMutation 写 clientId），其余 8 项在 v9.2.1 中完成。

# v9.0.12 Checklist

## Phase 1: SPEC 完整性
- [x] spec.md 存在且包含 Why / What Changes / Impact / 用户可见改善
- [x] tasks.md 存在且任务可勾选
- [x] checklist.md 存在（本文件）

## Phase 2: 代码修复

### P0（必须）
- [ ] `isImportMode` 显式声明
- [ ] Transaction onChange 补心跳刷新
- [ ] Profile onChange 补心跳刷新

### P1（重要）
- [ ] runningData 含 clientId
- [ ] DAL.startTask 传 clientId
- [ ] tbMutation.startTask 写 clientId
- [ ] onChange 端 null-safe 防御
- [ ] unsubscribeAll 动态退避

### P2（次要）
- [ ] addTransaction 即时更新本地 completionCount
- [ ] 抽取公共 `__fixCompletionCount()`

## Phase 3: 版本号

11 处版本号全部更新到 v9.0.12：
- [ ] APP_VERSION（app-1.js:2）
- [ ] 启动日志注释（app-1.js:6）
- [ ] `<title>`（index.html:12）
- [ ] `.version-subtitle`（index.html:201）
- [ ] 关于页版本号
- [ ] 用户日志版本标题
- [ ] sw.js 注释
- [ ] CACHE_NAME
- [ ] build.gradle versionName
- [ ] build.gradle versionCode (42→43)
- [ ] AGENTS.md 当前版本

## Phase 4: 文档

- [ ] AGENTS.md v9.0.12 技术日志
- [ ] index.html v9.0.12 用户日志
- [ ] 副标题撰写（如"Watch 雪崩治理 + 客户端 ID 端到端"）

## Phase 5: 验证

- [ ] 不抛 `isImportMode is not defined`
- [ ] Watchdog 不再 60s 雪崩
- [ ] Running 事件正确识别本机
- [ ] 僵尸 watchId 数量 < 1
- [ ] completionCount 落后时立即修复

## Phase 6: 部署

- [ ] 部署云函数 `tbMutation`（startTask 写 clientId）
- [ ] 推送用户通知（如有）

## 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| 修改云函数需重新部署 | 中 | 旧客户端兼容（无 clientId 时跳过本机识别） |
| 11 处版本号易遗漏 | 中 | 按 checklist 逐项勾选 |
| unsubscribeAll 退避可能延迟首屏 | 低 | 5 次 × 3s = 15s 上限可接受 |
| completionCount 重复触发 saveTask | 低 | 用节流避免频繁写 |
