# v9.17.9 回退预案：云端配置架构重构

> 本文档提供 v9.17.9 (2026-07-06) 的多层回退方案，按"侵入度"从低到高排列。AI 助手在收到"回退 v9.17.9"指令时按顺序优先尝试低侵入度方案。

## 📋 改动回顾

v9.17.9 引入云端配置统一管理架构，新增 7 个文件，修改 6 个文件。所有改动均为**架构层重构**，不修改任何业务逻辑；配置文件默认值与原硬编码**完全一致**，理论上对用户无感知。

## 🎯 回退触发条件

满足以下任一条件时启动回退：

1. **生产环境真机出现崩溃/卡死/数据异常**，且 24 小时内无法定位修复
2. **Watch 监听、云端同步、AI 调用三条主链路任意一条失效**
3. **用户大规模反馈"应用无法启动"**（覆盖默认配置兜底失败）
4. **任意云端数据被错误 envId 污染**（需要紧急回退避免数据写入错误环境）

## 🔧 回退方案（按优先级）

### 方案 A：配置回滚（推荐，30 秒完成）

**适用场景**：配置文件值错误（如 endpoint URL 写错），但配置架构本身工作正常。

**操作步骤**：

1. 编辑 `android_project/app/src/main/assets/www/config/config.production.json`，修正错误值
2. 编辑 `android_project/app/src/main/assets/config/config.production.json`，同步修正
3. 重新打包 APK：`.\log&data\sync.ps1 -Clean -Silent`
4. 同步根目录 PWA 副本：`.\scripts\sync-www.ps1`

**优点**：
- 保留新架构，未来仍可享受多环境切换能力
- 不影响用户数据
- 重新打包即可生效

**缺点**：
- 仍需 30-60 秒重新打包 + 安装

### 方案 B：环境强制降级（10 秒完成）

**适用场景**：production 环境配置加载异常导致所有用户受影响，需要快速切换到开发配置或屏蔽新配置。

**操作步骤**：

**B1：禁用新配置（最快）**
- 在 `AndroidManifest.xml` 中**删除**整个 `<meta-data android:name="cloud_env" ... />` 节点
- 重新打包：`.\log&data\sync.ps1 -Clean -Silent`
- 效果：所有用户回退到 `cloud_env=production` 默认值（即原硬编码值）

**B2：临时切换到 development 环境**
- 修改 `AndroidManifest.xml` 中 `cloud_env` 值为 `development`
- 重新打包
- 效果：所有用户从 dev 配置文件加载（dev 环境 endpoints 可能不通，仅用于调试）

### 方案 C：Git Revert 完整回退（3-5 分钟完成）

**适用场景**：v9.17.9 整个版本引入严重 bug，且方案 A/B 无法解决。

**操作步骤**：

```powershell
# 1. 查看 v9.17.9 commit hash
cd "d:/TimeBank"
git log --oneline -5

# 2. 创建回退 commit（保留历史记录）
git revert <v9.17.9-commit-hash> --no-edit

# 3. 同步根目录 PWA 副本
.\scripts\sync-all.ps1

# 4. 重新打包并安装
.\log&data\sync.ps1 -Clean -Logcat -Silent
```

**优点**：
- 完全回到 v9.17.8 状态
- 不影响 v9.17.9 之前的提交历史

**缺点**：
- 重新打包安装耗时 3-5 分钟
- 用户需要重新安装 APK

### 方案 D：紧急禁用（30 秒完成，仅限极端情况）

**适用场景**：方案 C 重新打包期间也需要快速止血（如大量用户受影响）。

**操作步骤**（在已安装的 APK 设备上手动干预）：

1. **JS 端禁用**（仅影响 PWA 网页端）：
   - 浏览器开发者工具 → Console → 执行：
     ```javascript
     window.configManager = null;
     location.reload();
     ```
   - 效果：JS 端会因 `window.configManager` 为 null 而使用代码内兜底（默认值）

2. **Android 端禁用**：
   - `adb shell pm clear com.jianglicheng.timebank`（清空 localStorage）
   - 用户需重新登录
   - 效果：清空 localStorage 后 JS 端 `tb_env` 也会清空，走默认 production

3. **不推荐**：手动修改设备上已安装 APK 的 assets（需要 root）

## 🚨 回退后必须验证

无论采用哪种方案，回退后必须验证以下 5 项：

| 验证项 | 命令 | 期望输出 |
|--------|------|----------|
| 应用可正常启动 | 手动打开应用 | 看到首页、登录入口 |
| CloudBase 初始化成功 | Chrome DevTools Console | 无 "SDK 未加载" / "初始化失败" 错误 |
| 云端同步链路正常 | Logcat 过滤 `CloudSyncWorker` | 看到 "Worker 启动" / "差集已暂存" |
| AI 链路正常 | 触发一次 AI 报告 | 返回正常 JSON，无 404/500 |
| 版本号正确 | 关于页 | 显示 v9.17.8（如果回到上一版）|

## 📞 回退失败升级

如果方案 A/B/C/D 全部失败，升级流程：

1. 立即通知开发者（用户）
2. 停止一切新功能开发，专注修复
3. 在 `docs/version-changelog.md` 追加"v9.17.9 回滚说明"章节
4. 决定是否发布 v9.17.9.1 hotfix 或直接跳到 v9.17.10

## 📝 回退后必做文档更新

回退完成后，必须更新以下文档：

- [ ] `docs/version-changelog.md` 追加 v9.17.9 回滚说明
- [ ] `docs/rollback-plan-v9.17.9.md`（本文档）追加"实际回退过程记录"章节
- [ ] 如果数据被污染，需要在 `docs/data-incident-log.md`（如不存在则创建）记录事件
- [ ] 更新 `AGENTS.md` 中"已知高危区域"表格（如 v9.17.9 暴露了新的风险点）

## 📌 回退信息登记（实施后填写）

> 留空，待实际回退时填写

- 回退时间：____
- 回退原因：____
- 采用方案：____
- 受影响用户数：____
- 数据损失评估：____
- 经验教训：____

---

**创建时间**：2026-07-06
**适用版本**：v9.17.9 (build 88)
**负责维护**：AI 助手 + 开发者本人
**紧急联系**：开发者本人（按 AGENTS.md 角色称谓）