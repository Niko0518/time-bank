# TimeBank (时间银行) - AI Agent 项目指南

> 本文件面向 AI 编程助手。**每次对话前自动导入，请保持简洁（≤800 行）**。
> 项目主要交流语言为中文。
> **历史版本细节** 已归档至 [`docs/version-history-archive.md`](./docs/version-history-archive.md)，主文件只保留最近 5 个完整版本。

---

## � AI 必须遵守的硬性约束

### 角色称谓
- "您" = 与我对话的人（开发者）
- "用户" = TimeBank 产品的使用者（产品反馈由开发者转述）
- 在一些情况下，开发者本人也是产品使用者

### 最高优先级禁令
- ❌ 禁止擅自修改任何位置的版本号（`APP_VERSION`、`CACHE_NAME`、`build.gradle` 的 `versionName`/`versionCode`、HTML `<title>`/`.version-subtitle`、关于页、用户日志版本标题等）。改前必须问："请问本次更新的版本号是多少？"
- ❌ 禁止日常开发自动同步。仅在收到"推送"指令时同步 Android → 根目录
- ❌ 禁止未经"推送"指令执行 `git push`
- ❌ 前端代码默认在 `android_project/app/src/main/assets/www/` 修改，根目录的 `index.html`/`js/`/`css/` 不在日常开发中修改

### 用户的"方案"≠ 实施
用户说"给我一个方案"、"做个方案"、"有什么方案"时，默认先不实施：给 2-3 个候选 + 优缺点 + 推荐一个 + 等用户确认。

### 模糊指令处理
- 先判断用户指令是否清晰，是否具有歧义
- 指令模糊时主动问 1-2 个关键问题（一次最多问 4 个）
- 不假装听懂，不用"理论上"、"应该可以"回复
- 不擅自加注释、调整格式、重构代码

### 改完代码必须说明（产品语言）
- 哪些文件被改
- 用户能看到什么变化
- 风险/副作用（如有）

### 工作开始前必做
1. 复述用户需求（用自己的话）
2. 询问是否涉及版本号修改
3. 列出将修改的文件清单

### 日志
- 用户日志（HTML 版本更新日志）：仅用户明确指令才改
- 技术日志（本文件第二部分）：仅记录"重要且影响深远"的改动

### 文件维护
- 仅保留最近 5 个完整版本日志，更早版本归档至 `docs/version-history-archive.md`
- 文件总行数 ≤ 800 行

---

## 1. 项目概述

**TimeBank（时间银行）** 是一款基于「时间货币」模型的个人时间管理与任务追踪混合式 Android 应用。

**核心理念**：将时间视为可赚取（earn）和消耗（spend）的货币。

**典型使用场景**：
| 平台 | 设备 | 使用方式 |
|------|------|---------|
| **Android** | 手机端 | 原生 APK，可使用悬浮窗计时器、小组件等原生功能 |
| **Android** | 平板端 | 原生 APK，支持分屏和大屏适配 |
| **网页端** | 浏览器 | PWA 应用，可安装到桌面，支持离线使用 |

**技术栈**：
| 层级 | 技术 |
|------|------|
| **前端** | Vanilla JS (ES6)，无框架 |
| **样式** | CSS 变量，支持暗色模式、三种卡片视觉 |
| **Android** | Java 11，minSdk 24，targetSdk 36 |
| **云服务** | 腾讯云 CloudBase（JS SDK v2） |
| **云函数** | Node.js 18.15 |

**当前版本**：`v9.0.9`

---

## 2. 项目结构与代码组织

### 2.1 前端文件（权威源：`android_project/app/src/main/assets/www/`）

> ⚠️ **默认修改位置**：所有前端代码修改**只在** `android_project/app/src/main/assets/www/` 目录下进行，**禁止**在根目录修改。

| 文件 | 用途 | 行数 |
|------|------|------|
| `index.html` | HTML 骨架 | ~4,200 |
| `css/main.css` | CSS 样式 | ~6,300 |
| `js/app-1.js` | 全局变量、DAL、任务卡片、initApp | ~6,200 |
| `js/app-2.js` | 颜色工具、计时/完成/停止、习惯系统 | ~6,100 |
| `js/app-reports.js` | 交易处理、报告系统、AI伙伴UI | ~8,200 |
| `js/app-sleep.js` | 睡眠管理 | ~3,200 |
| `js/app-systems.js` | 设备ID、屏幕时间、金融系统、自动检测 | ~5,300 |
| `js/app-auth.js` | 登录、数据导入导出 | ~3,400 |
| `js/ai-service.js` | AI 服务层 | ~2,500 |

### 2.2 JS 文件加载顺序（不可更改）

```
sw-register.js → qps-limiter.js → ai-service.js → app-1.js → app-2.js → app-reports.js → app-sleep.js → app-systems.js → app-auth.js
```

### 2.3 各 JS 文件功能领域

| 文件 | 搜索哪类功能 |
|------|-------------|
| `js/app-1.js` | DAL、CloudBase、Watch监听、initApp |
| `js/app-2.js` | 任务计时/完成/停止、习惯连胜 |
| `js/app-reports.js` | addTransaction、报告页、热图、AI洞察 |
| `js/app-systems.js` | 屏幕时间、金融系统、自动检测补录 |
| `js/app-auth.js` | handleEmailLogin、saveData、loadData |
| `js/ai-service.js` | AI报告、AI伙伴、AI认知同步 |

### 2.4 Android 原生文件

| 文件 | 职责 |
|------|------|
| `MainActivity.java` | WebView 宿主，`WebViewAssetLoader` 映射 `timebank.local` |
| `WebAppInterface.java` | JS Bridge `window.Android`，~1,900 行 |
| `FloatingTimerService.java` | 悬浮窗计时器服务 |

---

## 3. ⚠️ 双端同步规则（最高优先级）

**权威源**: `android_project/app/src/main/assets/www/`

**默认修改位置**: 所有前端代码修改**只在** `android_project/app/src/main/assets/www/` 目录下进行

**同步时机**: 仅在收到"推送"指令时，同步到根目录

**同步命令**（仅推送前执行）:
```powershell
Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
Copy-Item "android_project/app/src/main/assets/www/sw.js" "sw.js" -Force
Copy-Item "android_project/app/src/main/assets/www/manifest.json" "manifest.json" -Force
Copy-Item "android_project/app/src/main/assets/www/css/*" "css/" -Recurse -Force
Copy-Item "android_project/app/src/main/assets/www/js/*" "js/" -Recurse -Force
```

### 「推送」工作流
1. **代码修改**：在 `android_project/app/src/main/assets/www/` 目录下进行
2. **双端同步**：执行上述同步命令（Android → 根目录）
3. **Hash 验证**：运行 `Get-FileHash` 确认两端完全一致
4. **检查版本号**：确认以下 11 个位置的版本号已更新：
   - `index.html`：`<title>` 标签（第 12 行）
   - `index.html`：`.version-subtitle`（首页副标题，第 201 行）⚠️ 易遗漏
   - `index.html`：关于页版本号（第 1346 行）
   - `index.html`：用户日志版本标题（第 1405 行）
   - `js/app-1.js`：`APP_VERSION` 常量（第 2 行）
   - `js/app-1.js`：启动日志注释（第 6 行）
   - `sw.js`：文件头部注释（第 1 行）
   - `sw.js`：`CACHE_NAME`（第 3 行）
   - `android_project/app/build.gradle`：`versionName`
   - `android_project/app/build.gradle`：`versionCode`
   - `AGENTS.md`：当前版本号
5. **检查日志**：确认技术日志（本文件第二部分）和用户日志（HTML 版本更新日志）已撰写
6. **执行推送**：仅当以上检查全部通过后，执行 `git add -A` → `git commit` → `git push`

> ⚠️ **禁止事项**：
> - ❌ 未经用户"推送"指令，不得擅自执行 `git push`
> - ❌ 不得擅自升级版本号（版本号由用户指定）
> - ❌ 不得跳过三端同步直接推送


---

## 4. 腾讯云 CloudBase 配置

### 4.1 自动部署与手动降级规则

**默认策略**：AI 尝试自动部署（`tcb CLI`），失败时**自动降级为手动部署并指导用户操作**，无需用户额外指令。

**自动部署命令**：
```powershell
tcb fn deploy <fnName> --force
```

**降级条件**（任一触发即降级）：
- OAuth/认证失败（auth.json 无凭证、device flow 需要浏览器交互）
- TRAE 沙箱拒绝写入 `~/.config/.cloudbase/.~auth.json` 等敏感文件
- 网络受限无法访问 `tcb.cloud.tencent.com`
- 连续 2 次 `tcb login`/`tcb fn deploy` 失败

**降级流程**：
1. AI 输出/修改云函数在D:\TimeBank\cloudbase-functions供用户完整复制
2. AI 给出**手动部署步骤**（CloudBase Web 控制台）
3. 用户在 https://tcb.cloud.tencent.com/dev 手动粘贴代码
4. AI 等待用户确认部署完成

### 4.2 环境信息
- **环境 ID**: `cloud1-8gvjsmyd7860b4a3`
- **SDK 版本**: v2.24.10

### 数据库集合

| 集合 | 安全规则 | 用途 |
|------|---------|------|
| `tb_profile` | 预置规则 | 用户资料 |
| `tb_task` | 预置规则 | 任务列表 |
| `tb_transaction` | **自定义规则** | 交易记录 |
| `tb_running` | 预置规则 | 运行中任务 |
| `tb_daily` | **自定义规则** | 每日统计 |
| `tb_ai_*` | 预置规则 | AI 相关数据 |

> ⚠️ `tb_transaction` / `tb_daily` 查询时必须添加 `where({ _openid: currentUid })`

### 云函数

| 云函数名 | 用途 | 超时 | 文件路径 |
|---------|------|------|---------|
| `tbMutation` | 统一数据变更（13个action） | 30s | `cloudbase-functions/tbMutation/index.js` |
| `timebankSync` | 增量查询 | 30s | `cloudbase-functions/timebankSync/index.js` |
| `timebankAI` | AI洞察/对话/伙伴/认知 | 60s | `cloudbase-functions/timebankAI/index.js` |
| `timebankTaskLock` | 分布式任务锁（60s TTL） | 10s | `cloudbase-functions/timebankTaskLock/index.js` |

> ⚠️ **v9.0.0 重要修复**：Web SDK `callFunction` 不会自动注入 `context.OPENID`，所有云函数统一使用 `context.OPENID \|\| event._openid \|\| event.data?._openid` 获取用户身份。

### 部署命令
```powershell
tcb fn deploy tbMutation --force
tcb fn deploy timebankSync --force
tcb fn deploy timebankAI --force
tcb fn deploy timebankTaskLock --force
tcb fn deploy --all --force
```

---

## 5. 构建与运行

### Android 安装
用户通过运行脚本安装到安卓端：
- **推荐（PowerShell）**：`D:\TimeBank\log&data\待修复数据\sync.ps1`
  - 右键 → "使用 PowerShell 运行"
  - 无编码问题，输出彩色日志
- **备用（批处理）**：`D:\TimeBank\log&data\待修复数据\sync.bat`
  - 直接双击运行
  - 如遇编码问题请使用 PowerShell 版本
- **Android 项目内**：`android_project/sync.bat`

**输出路径**：
- Release: `android_project/app/build/outputs/apk/release/app-release.apk`
- Debug: `android_project/app/build/outputs/apk/debug/app-debug.apk`

### PWA 安装（网页端）
1. 在浏览器中打开网页端地址
2. 浏览器检测到 Service Worker 后会自动显示安装提示
3. 或手动点击浏览器菜单 → "安装" → "时间银行"
4. 安装后可从桌面/开始菜单启动，离线可用

### 调试
- **Chrome DevTools**: 通过 Chrome 远程调试 WebView (`chrome://inspect`)
- **Android 日志**: 使用 `adb logcat` 查看 Android 日志
- **Console 日志**: 前端 console.log 会输出到 Chrome DevTools

---

## 6. 已知高危区域（修改需谨慎）

| 区域 | 风险等级 | 相关版本 |
|------|---------|---------|
| **睡眠时区计算** | 高 | v7.13.1 修复过 |
| **配额+自动检测补录** | 高 | 计时消费配额曾出错 |
| **习惯连胜系统** | 高 | v7.39.x 重构 |
| **Watch 连接与同步** | 高 | v8.2.2 修复 |
| **金融系统利息计算** | 高 | v8.2.14 修复 |
| **跨设备 running 同步** | 高 | v8.2.15 修复 |

---

## 7. 代码风格指南

### JavaScript
- **无框架**：纯 Vanilla JS，全局作用域函数
- **内联事件**：大量使用 `onclick` 处理器
- **注释**：中文为主，关键修复标注版本号（如 `// [v8.2.2] 修复...`）

### CSS
- 单文件：`css/main.css`（~6,300 行）
- 设计令牌：CSS 自定义属性（`--color-primary` 等）
- 三大卡片视觉：Gradient / Flat / Glass

### Android
- WebView 使用 `WebViewAssetLoader` 映射 `https://timebank.local`
- 动态权限申请

---

## 8. 安全考虑

- **事务操作**：所有数据变更通过云函数 `tbMutation` 统一执行，余额使用 `_.inc()` 原子更新
- **并发冲突**：云函数串行化写入天然互斥；`timebankTaskLock` 提供 60 秒 TTL 分布式锁（任务级）
- **API Key**：存储在 CloudBase 云函数环境变量，不暴露客户端
- **HTTP 服务**：当前免鉴权，生产环境建议开启鉴权

---

# 第二部分：版本更新日志

> 仅保留最近 5 个完整版本。更早版本见"附录：历史版本索引"与 [`docs/version-history-archive.md`](./docs/version-history-archive.md)。

---

## v9.0.9（修复：长时间计时任务结束后可能"复活"的 bug）

### 核心问题
安卓端长时间运行的计时任务结束后，任务可能"复活"——再次出现在运行中列表。用户点击取消后，失败队列增加一条"数据不存在 stopTask"（错误码 1003，描述"云端未找到该运行任务"）。

### 根因
1. `stopTask` 函数中，`runningTasks.delete(taskId)` 和 `DAL.stopTask()`（云端删除）之后，才调用 `saveLocalCache()` 保存本地缓存
2. 如果用户在 `saveLocalCache` 执行完成前杀进程/切后台/刷新页面，本地 `localStorage.timeBankData` 中的 `runningTasks` 仍包含已结束的任务
3. 下次启动时，`applyDataState` 从本地缓存恢复，该任务被"复活"
4. 用户再次点击取消时，`DAL.stopTask` 发现云端 `tb_running` 中已不存在该任务，返回 1003 错误
5. 其他设备不会出现此问题，因为它们从云端加载数据，而云端数据是正确的

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | `stopTask` 中 `saveLocalCache` 提前到 `DAL.stopTask` 之前 | [app-2.js:4819](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4819) `runningTasks.delete(taskId)` 后立即 `await saveLocalCache()`，再调用云端 `DAL.stopTask` |
| **2** | `cancelTask` 中同样提前 `saveLocalCache` | [app-2.js:4784](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4784) 同上逻辑，防止取消路径也出现复活 |
| **3** | `applyDataState` 启动时检测并清理"幽灵任务" | [app-auth.js:2389](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2389) 遍历本地缓存的 `runningTasks`，如果某任务的 `startTime` 早于其最近一笔交易的 `timestamp` 超过 5 秒，则判定为幽灵任务并自动清理 |

### 关键 Bug 详解

#### 幽灵任务复活

**触发条件**：
- 安卓端结束一个长时间运行的计时任务（运行时间越长，用户越可能在结束后立即操作其他事情）
- 用户在任务结束后 1-2 秒内切后台或杀进程
- `saveLocalCache` 异步执行尚未完成

**修复前**：
```javascript
// app-2.js: stopTask
runningTasks.delete(taskId);           // 1. 内存中删除
await DAL.stopTask(taskId, runningTask); // 2. 云端删除（可能成功）
// ... 添加交易等操作 ...
await saveLocalCache();                  // 3. 本地缓存保存（可能未执行）
```

**修复后**：
```javascript
runningTasks.delete(taskId);           // 1. 内存中删除
await saveLocalCache();                  // 2. [v9.0.9] 立即保存本地缓存
await DAL.stopTask(taskId, runningTask); // 3. 云端删除
```

#### applyDataState 幽灵任务清理

**修复前**：
```javascript
// app-auth.js: applyDataState
const cloudRunning = new Map(safeRunningTasks);
// 直接信任本地缓存的 runningTasks，不做一致性校验
```

**修复后**：
```javascript
const ghostTaskIds = [];
cloudRunning.forEach((val, key) => {
    const lastTx = transactions
        .filter(t => t.taskId === key && !t.undone)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    if (lastTx && lastTx.timestamp) {
        const txTime = new Date(lastTx.timestamp).getTime();
        if (txTime > (val.startTime || 0) + 5000) {
            ghostTaskIds.push(key); // 交易时间比启动时间晚 >5s，判定为幽灵
        }
    }
});
ghostTaskIds.forEach(id => cloudRunning.delete(id));
```

### 用户可见改善
- **任务不再复活**：长时间计时任务结束后，即使立即杀进程，下次启动任务也不会再出现
- **取消操作不再报错**：复活后的任务点击取消不再触发"数据不存在"错误
- **自动修复历史数据**：如果本地缓存中已存在幽灵任务，下次启动时自动清理并记录日志
- **失败队列更干净**：不再积累因幽灵任务产生的无效 1003 错误

### 影响范围
- 修改 2 个文件：app-2.js、app-auth.js
- 修改 3 个文件：index.html、sw.js、build.gradle
- 修改 1 个文件：AGENTS.md
- 11 处版本号同步更新到 v9.0.9（versionCode 38→39）
- **无需云端部署**：纯客户端修复，云函数 `tbMutation` 的 `stopTask` 逻辑保持不变

---

## v9.0.8（修复：_.set() 包装导致分类颜色/折叠状态云端存储损坏）

### 核心问题
网页端任务标签颜色丢失、折叠状态异常。根因：v9.0.4 引入的 `_syncProfileFieldToCloud` 函数在自动同步 `categoryColors` / `collapsedCategories` 时，错误地使用了 `_.set(serializedValue)` 包装数据。

### 根因
1. `_syncProfileFieldToCloud` 调用 `DAL.saveProfile({ categoryColors: _.set([['cat1', '#fff']]) })`
2. `_.set()` 返回 `{fieldName: {...}, operands: [[['cat1', '#fff']]], operator: 'set'}` 对象
3. 云函数 `tbMutation` 的 `saveProfile` action 第 396 行再次执行 `updateData[key] = _.set(value)`，对已经是 `_.set()` 包装的对象再次包装
4. 云端 `tb_profile.categoryColors` 被存储为 `{fieldName: {...}, operands: [...], operator: 'set'}` 格式
5. 下次加载时，`setCategoryColors` 收到这个对象，v9.0.6 hotfix-2 的 `Object.entries` 修复产生错误结果 `[['fieldName', {...}], ['operands', [...]], ['operator', 'set']]`，而非 `[['cat1', '#fff']]`

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | `_syncProfileFieldToCloud` 移除 `_.set()` 包装 | [app-1.js:4687](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4687) 直接传递 `serializedValue`，不再用 `_.set()` 包装 |
| **2** | `setCategoryColors` 识别 `_.set()` 包装对象 | [app-1.js:4774](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4774) 检测 `arr.operator === 'set' && Array.isArray(arr.operands)`，提取 `arr.operands[0]` 恢复原始值 |
| **3** | `setCollapsedCategories` 识别 `_.set()` 包装对象 | [app-1.js:4794](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4794) 同上逻辑 |

### 用户可见改善
- **分类颜色不再丢失**：网页端修改分类颜色后刷新，颜色正确保留
- **折叠状态正确持久化**：分类的收起/展开状态跨会话保留
- **自动修复已损坏数据**：如果云端数据已被 `_.set()` 格式污染，加载时自动识别并恢复
- **跨设备同步正常**：Android 端和网页端的颜色/折叠状态同步一致

### 影响范围
- 修改 2 个文件：app-1.js、index.html
- 修改 2 个文件：sw.js、build.gradle
- 修改 1 个文件：AGENTS.md
- 11 处版本号同步更新到 v9.0.8（versionCode 37→38）
- **无需云端部署**：纯客户端修复，云函数 `tbMutation` 的 `_.set()` 保护机制仍然正常工作（只是客户端不再重复包装）

---

## v9.0.7（习惯系统重构：applyDataState 索引重建 + 单一数据源 + 索引清理）

### 核心问题
v9.0.1 之后才暴露的"连胜突然清零"bug：
1. **P0-1 索引空状态下的 streak=1**：`applyDataState` 加载本地缓存到内存后**没有**调用 `buildTransactionIndex`，导致 `transactionIndex` 保持空 Map。`addTransaction` 同步添加 1 笔新交易到索引后，`rebuildHabitStreak` 的 `transactionIndex.has(task.id)=true` 走索引路径，但索引中**只有 1 笔**，算出 streak=1 覆盖原本的连胜。
2. **P0-2 onRollback 索引残留**：`DAL.addTransaction.onRollback` 仅从 `transactions` 数组删除交易，**未同步清理 `transactionIndex`**，残留数据导致后续计算错位。
3. **P1-1 两次读数据漂移**：`processHabitCompletion` 两次读 `task.habitDetails.streak`（先 oldStreak，再 rebuildHabitStreak 后取 newStreak），两次读之间可能因异步操作漂移。

### 根因
- `applyDataState`（v7.x 引入）只加载 `transactions` 数组，**从未**调 `buildTransactionIndex`——这条路径下 `transactionIndex` 永远是空
- v9.0.2/v9.0.5 引入的 onRollback 只关注 `transactions` 数组一致性，遗漏了 `transactionIndex` 同步清理
- 启动流程有 2 条路径加载数据：`DAL.loadAll`（云端全量）和 `applyDataState`（本地缓存）；前者**会**调 `buildTransactionIndex`，后者**不会**——这是 v7.37.0 引入索引以来一直存在的 bug

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **applyDataState 末尾 buildTransactionIndex** | [app-auth.js:2491](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2491) 本地缓存加载完成后立即构建索引，与 `DAL.loadAll` 路径行为一致 |
| **2** | **DAL.addTransaction.onRollback 加 removeFromTransactionIndex** | [app-1.js:3056](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3056) onRollback 失败时同步清理索引 |
| **3** | **DAL.updateTransaction.onRollback 加索引恢复** | [app-1.js:3112](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3112) 用 snapshot 恢复交易时同步 addToTransactionIndex |
| **4** | **DAL.deleteTransaction.onRollback 加索引恢复** | [app-1.js:3167](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3167) 恢复被删除交易时 addToTransactionIndex |
| **5** | **rebuildHabitStreak 单一数据源** | [app-2.js:6014](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6014) **永远**用 `transactions.filter`，不再 `transactionIndex.has` 判断 |
| **6** | **rebuildHabitStreak 返回 prev/new** | [app-2.js:6143](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6143) 返回 `{prevStreak, newStreak, lastCompletionDate, streakChanged, lastDateChanged}` 给 processHabitCompletion |
| **7** | **processHabitCompletion 一次原子调用** | [app-2.js:4292](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4292) 使用 rebuildHabitStreak 返回值，消除两次读漂移 |
| **8** | **processHabitCompletion 数据源统一** | [app-2.js:4303](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4303) `prevQualifiedPeriods` 循环用 `transactions.filter`，不再 `transactionIndex.get` |
| **9** | **新增 fixAllHabitStreaks** | [app-2.js:6151](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6151) 批量重算所有 habit 任务的 streak 并写回云端 |
| **10** | **设置页加"修复习惯连胜"按钮** | [index.html:752](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L752) `onclick="handleFixHabitStreaksClick()"` 弹确认 → 调 fixAllHabitStreaks → 弹结果 |
| **11** | **新增 handleFixHabitStreaksClick 包装** | [app-2.js:6198](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6198) 弹窗 + 进度 + 结果展示 |

### 关键 Bug 详解

#### P0-1 索引空状态下 streak=1

**触发条件**：
- App 通过 `applyDataState` 走本地缓存秒开（不走云端全量同步）
- 用户在 `handlePostLoginDataInit` 后台同步**完成前**点击完成习惯任务

**修复前**：
```javascript
// app-auth.js: applyDataState 末尾
tasks = data.tasks || [];
transactions = data.transactions || [];
// ❌ 没有 buildTransactionIndex()，transactionIndex 一直是空 Map

// app-2.js: rebuildHabitStreak
const taskTxs = (typeof transactionIndex !== 'undefined' && transactionIndex.has(task.id))
    ? transactionIndex.get(task.id)  // ❌ addToTransactionIndex 后只含 1 笔
    : transactions.filter(t => t.taskId === task.id);
```

**修复后**：
```javascript
// app-auth.js: applyDataState 末尾
tasks = data.tasks || [];
transactions = data.transactions || [];
if (typeof buildTransactionIndex === 'function') {
    buildTransactionIndex();  // ✅ 与 DAL.loadAll 路径行为一致
}

// app-2.js: rebuildHabitStreak
const taskTransactions = transactions  // ✅ 永远用 transactions
    .filter(t => t.taskId === task.id && t.type === 'earn' && !t.undone)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
```

#### P0-2 onRollback 索引残留

**修复前**：
```javascript
// app-1.js: DAL.addTransaction.onRollback
onRollback: () => {
    const idx = transactions.findIndex(t => t.id === txId);
    if (idx !== -1) transactions.splice(idx, 1);  // ❌ 只删数组
    // 索引残留，addToTransactionIndex 没反向
}
```

**修复后**：
```javascript
onRollback: () => {
    const idx = transactions.findIndex(t => t.id === txId);
    if (idx !== -1) transactions.splice(idx, 1);
    if (typeof removeFromTransactionIndex === 'function' && tx.taskId) {
        removeFromTransactionIndex(tx.taskId, tx.clientId, tx.timestamp);  // ✅ 同步清理
    }
}
```

#### P1-1 两次读数据漂移

**修复前**：
```javascript
// app-2.js: processHabitCompletion
const oldStreak = task.habitDetails?.streak || 0;  // 读 1
rebuildHabitStreak(task);  // 中间可能因异步/Proxy 触发修改
const newStreak = task.habitDetails?.streak || 0;  // 读 2
const shouldAwardBonus = newStreak > oldStreak && ...;  // ❌ 漂移
```

**修复后**：
```javascript
// app-2.js: processHabitCompletion
const result = rebuildHabitStreak(task);  // 一次调用
const { prevStreak: oldStreak, newStreak, lastCompletionDate } = result;  // 一次读取
// 无漂移
```

### 用户可见改善
- **连胜不再突然清零**：所有启动场景下 habit 计算都基于完整交易历史
- **奖励发放与连胜一致**：避免"连胜=1 但有奖励"或"连胜=15 但没奖励"
- **可手动修复历史数据**：设置页"修复习惯连胜"按钮一键恢复 v9.0.1 ~ v9.0.6 期间被错误清零的连胜
- **onRollback 更彻底**：索引残留彻底杜绝

### 影响范围
- 修改 4 个文件：app-auth.js、app-1.js、app-2.js、index.html
- 新增 2 个文件：docs/v9.0.7-design.md、新建节
- 新增 ~80 行（fixAllHabitStreaks、handleFixHabitStreaksClick、buildTransactionIndex 调用）
- 11 处版本号同步更新到 v9.0.7（versionCode 36→37）
- **无需云端部署**：纯客户端修复

### 为 v9.1.0 铺路
- 习惯系统的"单一数据源"原则与 v9.1.0 复合 mutation 原子性兼容
- 索引清理逻辑可复用于 v9.1.0 复合操作的"反向操作"步骤

---

## v9.0.5（P0 修复：任务复活数据损坏 + onRollback 完整化）

### 核心问题
v9.0.2 引入 onRollback 后，机制覆盖不全。导致 2 类严重 bug：
1. **P0-A 任务复活数据损坏**：DAL.stopTask 的 onRollback 快照用了错误的字段（保存的是 `_id` 字符串而非 taskData 对象），失败时"复活"的任务数据完全损坏
2. **onRollback 覆盖不全**：updateTransaction / deleteTransaction / saveTask / deleteTask 4 个 mutation 没有 onRollback，失败时 UI 与数据漂移

### 根因
1. v9.0.2 改造时 onRollback 抽取了"addTransaction / stopTask / startTask / saveProfile"4 个**关键路径**，但遗漏了 4 个**次关键路径**
2. DAL.stopTask 在抽取 onRollback 时复制粘贴错误，把 `cachedRunning`（含 `_id`）当成了 `taskData`——`_id` 是云端文档 ID 字符串，不是任务数据本体

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **DAL.stopTask 快照修正** | [app-1.js:3250](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3250) onRollback 快照从 `cachedRunning` 改为 `cachedTaskData`（含 taskData + _id 两个字段） |
| **2** | stopTask 调用方传递 taskData 快照 | [app-2.js:4825](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4825) `await DAL.stopTask(taskId, runningTask)` 传入 `runningTask` 快照 |
| **3** | updateTransaction 注入 onRollback | 失败时回滚本地交易（恢复 prevTx 或删除新增）+ 修正余额差量 |
| **4** | deleteTransaction 注入 onRollback | 失败时恢复被删除的交易 + 修正余额 |
| **5** | saveTask 注入 onRollback | 失败时恢复旧任务（prevTask）或删除新建任务 |
| **6** | deleteTask 注入 onRollback | 失败时恢复被删除的任务 |
| **7** | Object Proxy 补 `deleteProperty` trap | [app-1.js:4722](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4722) `reportState.xxx` 的 delete 操作也能触发云端同步 |
| **8** | `_notifiedIds` 内存清理 | [app-1.js:1027](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1027) 移除失败项时同步从 `_notifiedIds` 删除，防止长会话内存驻留 |
| **9** | recalculateBalance 移除冗余 clientId | [app-1.js:3457](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3457) 补 v9.0.3 P2-2 遗漏的 clientId 清理 |

### 关键 Bug 详解

#### P0-A：任务复活数据损坏

**触发条件**：安卓端结束计时任务时，云端报 1003（资源不存在）——常见于用户在两台设备上同时结束同一任务，或设备时钟漂移导致云端已自动清理。

**修复前**：
```javascript
// app-1.js
const cachedRunning = this.runningCache.get(taskId);  // ❌ 错：这是 _id 字符串
callMutation('stopTask', ..., {
    onRollback: () => {
        runningTasks.set(taskId, cachedRunning);  // ❌ 把 _id 字符串当任务数据塞回去
    }
});
```

**修复后**：
```javascript
const cachedTaskData = taskDataSnapshot || runningTasks.get(taskId);  // ✅ 正确的 taskData 对象
const cachedCacheId = this.runningCache.get(taskId);
callMutation('stopTask', ..., {
    onRollback: () => {
        if (cachedTaskData) {
            runningTasks.set(taskId, cachedTaskData);  // ✅ 恢复完整 taskData
            if (cachedCacheId) this.runningCache.set(taskId, cachedCacheId);
        } else {
            runningTasks.delete(taskId);  // ✅ 本来就没有
            this.runningCache.delete(taskId);
        }
        if (typeof updateAllUI === 'function') updateAllUI();
    }
});
```

#### onRollback 完整化（4 个 mutation）

| Mutation | 快照字段 | 回滚逻辑 |
|----------|----------|----------|
| `updateTransaction` | `prevTx`（修改前的交易） | 恢复 prevTx（覆盖更新）或删除新增交易 + 修正余额差量 |
| `deleteTransaction` | `_originalTx`（被删除的交易） | 重新加回 _originalTx + 修正余额 |
| `saveTask` | `prevTask`（修改前的任务） | 恢复 prevTask（覆盖更新）或删除新建任务 |
| `deleteTask` | `_originalTask`（被删除的任务） | 重新加回 _originalTask |

### Proxy deleteProperty 补全

v9.0.4 引入 Proxy 同步时只补了 `set`/`get` trap，遗漏 `deleteProperty`：

```javascript
// app-1.js:4722 修复后
return new Proxy(target, {
    set(t, prop, value, receiver) { ... },
    deleteProperty(t, prop) {                    // [v9.0.5] 新增
        const result = Reflect.deleteProperty(t, prop);
        if (result) _syncProfileFieldToCloud(fieldName, t);
        return result;
    }
});
```

### 用户可见改善
- **任务复活不再损坏**：安卓端结束任务失败时，任务以"完整数据"复活（计时、暂停历史、累计时间保留），不再"空壳任务"
- **修改任务/交易失败时 UI 立即回滚**：不再"瞬变瞬回"看不到反馈
- **删除任务/交易失败时自动恢复**：不再"看似删除但还在"
- **失败通知不重复打扰**：长会话不再积累 `_notifiedIds` 内存

### 影响范围
- 修改 1 个文件：app-1.js（+ ~80 行 onRollback 逻辑）
- 修改 1 个文件：app-2.js（+ 1 行参数传递）
- 11 个版本号位置同步更新到 v9.0.5（versionCode 35→36）
- **无需云端部署**：纯客户端修复，v9.0.2 错误码体系已就位

### 为 v9.1.0 铺路
v9.0.5 是 v9.1.0 "复合 mutation 原子性" 的基础：
- 8 个 mutation 全部具备 onRollback 后，复合操作失败时云端可放心地"反向操作"，客户端只需撤销 UI
- 详细方案见 [`docs/v9.1.0-design.md`](./docs/v9.1.0-design.md)

---

## v9.0.4（P2-1 saveData 批量保存模式重构 + Proxy 同步机制）

### 核心问题
v9.0.0 引入服务端权威写入架构后，业务层仍大量使用 `saveData()` 进行"批量模糊保存"（共 56 处调用），导致：
1. `saveData()` 每次调用都传递全量字段，与"局部精确修改"理念冲突
2. 内部需判断"是否登录"、"是否有首次同步完成"、"数据是否为空"等 7 个条件
3. 实际只同步 4 个固定 profile 字段（`reportState` / `categoryColors` / `collapsedCategories` / `deletedTaskCategoryMap`），其余 11 个字段仅作"打酱油"参数
4. 本地缓存与云端同步逻辑耦合，难以独立优化
5. **架构漂移隐患**：业务层依赖"调用 saveData 自动同步 4 个字段"这条隐性约定，新人接手代码容易遗漏

### 根因
`saveData()` 是 v6.0.0 多表模式前的遗留接口，设计初衷是"全量保存所有数据"，但 v9.0.0 后已被细粒度 `callMutation` 替代，仅剩 profile 字段同步功能。

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | Proxy 自动包装 3 个 profile 字段 | `categoryColors`（Map）、`collapsedCategories`（Set）、`reportState`（Object）通过 Proxy 拦截 `set/add/delete` 操作，自动触发云端同步（300ms 去抖） |
| **2** | 新增 `_syncProfileFieldToCloud()` 统一同步函数 | 检查登录态/首次同步/网络可用后，调用 `DAL.saveProfile({ [field]: _.set(value) })` |
| **3** | 新增 3 个包装函数 `setCategoryColors` / `setCollapsedCategories` / `setReportState` | 修复业务层"let xxx = new Map()"直接赋值会破坏 Proxy 自动同步的致命 bug；18 个赋值点全部改用包装函数 |
| **4** | 抽取 `saveLocalCache()` 独立入口 | 原 `saveData()` 中的本地缓存逻辑（`saveLocalCacheWithFallback`）拆分为独立函数 |
| **5** | `saveData()` 改造为薄包装 | 保留函数定义并直接调用 `saveLocalCache()`，确保兼容性（旧代码 / 文档引用） |
| **6** | 56 处 `saveData()` 调用替换 | 6 个 JS 文件中所有 `saveData()` 调用全部替换为 `saveLocalCache()`（app-1.js:5、app-2.js:18、app-reports.js:6、app-systems.js:14、app-sleep.js:3、app-auth.js:9） |
| **7** | 删除 120 行冗余逻辑 | 原 `saveData()` 中云端同步、空数据保护、登录态保护、profile 字段黑名单等代码全部删除 |

### Proxy 同步机制详解

```javascript
// 拦截 Map/Set 的 set/add/delete/clear 操作
function _createSyncMapProxy(initial, fieldName) {
    const target = new Map(initial);
    return new Proxy(target, {
        get(t, prop, receiver) {
            const val = Reflect.get(t, prop, receiver);
            if (typeof val === 'function' && (prop === 'set' || prop === 'delete' || prop === 'clear')) {
                return function(...args) {
                    const result = val.apply(t, args);
                    _syncProfileFieldToCloud(fieldName, t);
                    return result;
                };
            }
            return val;
        }
    });
}
```

### 关键 Bug 修复（review 发现）
**致命问题**：业务层 18 处 `categoryColors = new Map(...)` / `collapsedCategories = new Set(...)` / `reportState = {...}` **直接赋值会破坏 Proxy 自动同步**！如果 Proxy 包裹的变量被重新赋值为普通 Map/Set/Object，Proxy 即失效，后续修改不再触发云端同步。

**修复方案**：新增 `setCategoryColors` / `setCollapsedCategories` / `setReportState` 3 个包装函数，内部重新创建 Proxy 并赋值；所有直接赋值点全部改用包装函数。

### 用户可见改善
- **透明**：用户感受不到差异（数据语义不变）
- **分类颜色/折叠状态/报告视图**：现在自动云端同步（之前依赖 `saveData()` 调用是否被业务层触发）
- **删除任务的分类记忆**：`deletedTaskCategoryMap` 已在 `rememberDeletedTaskCategory()` 函数中显式调用 `DAL.saveProfile`
- **代码更清晰**：业务层不再需要关心"调用 saveData 后会同步哪些字段"这种隐性约定

### 影响范围
- 修改 6 个文件：app-1.js、app-2.js、app-reports.js、app-sleep.js、app-systems.js、app-auth.js
- 新增 ~80 行（Proxy 工厂 + 3 个包装函数 + 同步函数）
- 删除 ~120 行（原 `saveData()` 内部冗余逻辑）
- 11 个版本号位置同步更新到 v9.0.4（versionCode 34→35）
- **必须同步部署云函数 `tbMutation`**（P2-2 清理 + P2-4 重构都已在 v9.0.3 部署于云端）

---

## v9.0.3（P2-2 clientId 清理 + P2-4 profile 嵌套 `_.set()` 白名单扩展）

### 核心问题
v9.0.0 引入的服务端权威写入架构已使 `clientId` 不再被云函数使用，但客户端仍向 mutation data 注入 `clientId`，云函数仍把它写入到 DB 文档——属于历史残留的"死数据"。

### 根因
- v9.0.0 主线改造聚焦在"客户端不再写 DB"和"云函数权威仲裁"，但**没有清理**跨设备同步架构（v8.2.x 时代）遗留下的 `clientId` 字段
- profile 嵌套保护 `_.set()` 维护 9 个白名单 key 写死列表，每次新增 profile 子对象都需要改云函数

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | 客户端 `callMutation` 移除 `clientId` 注入 | [app-1.js:1115](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1115) `data: { ...data }` 取代 `data: { ...data, clientId }` |
| **2** | 云函数 `tbMutation` 6 处移除 `clientId` 字段写入 | addTransaction/saveTask/startTask/updateRunningTask 等 action 不再向 DB 文档写 `clientId` 字段 |
| **3** | `saveProfile` 自动判断嵌套对象 | 9 个写死 key 替换为 `Object.keys().filter(v => isPlainObject(v))` 模式，新增 profile 子对象无需改云函数 |
| **4** | `_.set()` 调用更安全 | 排除 `null`、数组、`Date` 对象，避免误包装 |

### 用户可见改善
- **透明**：用户感受不到差异（数据语义不变）
- **云函数存储节省**：tb_transaction/tb_task/tb_running 文档不再写入冗余的 `clientId` 字段
- **维护性提升**：新增 profile 子对象（如新增 `aiSettings`）无需改云函数白名单

### 影响范围
- 修改 2 个文件：app-1.js、tbMutation/index.js
- 11 个版本号位置同步更新到 v9.0.3（versionCode 33→34）
- **必须同步部署云函数 `tbMutation`**（P2-2 清理 + P2-4 重构都在云端）

---

## v9.0.2（onRollback 完善 + mutationQueue 失败通知）

### 核心问题
v9.0.0 引入的"乐观更新 + 云函数写入"模式缺少回滚机制，导致**UI 与数据不一致**与**静默数据丢失**。典型场景：用户在安卓端"连接中"时结束任务，UI 瞬间显示成功，1 秒后回退到原状态（用户报告的真实 bug）。

### 根因
`callMutation` 是 fire-and-forget，失败时：
1. 业务层 50+ 处调用**没有任何一处**传入 `onRollback` 回滚
2. `mutationQueue` 重试 10 次后**静默丢弃**，用户完全不知情
3. 业务错误（如余额不足）与网络错误混在一起，没有分类处理

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | 新增 `MutationFailureHandler` 统一失败处理模块 | 持久化失败队列 `tb_failed_mutations`、弹窗通知、回滚兜底、设置页查询 API |
| **2** | 改造 `callMutation` 失败处理 | 业务错误（1001-1004）立即回滚 + 通知 + **不入重试队列**；网络/限流/内部错误入队 + 回滚 + 记录 |
| **3** | 改造 `flushMutationQueue` 失败处理 | 业务错误不重试直接丢弃并通知；可重试错误重试 10 次后**记录 + 通知 + 丢弃**；7 天后过期也记录 + 通知 |
| **4** | 关键业务路径注入 `onRollback` | `addTransaction`（移除交易+修正余额）、`stopTask`（恢复 running ）、`startTask`（恢复 running）、`saveProfile`（恢复 profile 快照） |
| **5** | 新增 `showFailedMutations()` 设置页 UI | 失败队列弹窗、按阶段/类型分类、单条重试/丢弃/全部清空 |
| **6** | index.html 设置页入口 | 失败队列按钮 + 红色 badge 角标（30s 自动刷新） |
| **7** | 云函数 `tbMutation` 错误码标准化 | 0/410/400/401/1001-1004/429/500/503 完整体系；`404 → 1003`；添加文件头注释 |
| **8** | 客户端 `MUTATION_ERROR_CODE` 枚举 + 错误分类辅助 | `isRetryableError()` / `isBusinessError()` 用于统一判断 |

### 错误码对照表

| Code | 含义 | 客户端处理 | 是否重试 |
|------|------|-----------|---------|
| 0 | 成功 | 视为成功 | - |
| 410 | 幂等（已存在） | 视为成功 | - |
| 400 | 参数缺失 | onRollback + 通知 | ❌ |
| 401 | 未登录 | onRollback | ❌ |
| 1001 | 业务异常（余额不足等） | onRollback + 通知 | ❌ |
| 1002 | 数据冲突 | onRollback + 通知 | ❌ |
| 1003 | 资源不存在 | onRollback + 通知 | ❌ |
| 1004 | 权限不足 | onRollback + 通知 | ❌ |
| 429 | 限流 | onRollback + 入队 | ✅ |
| 500 | 内部错误 | onRollback + 入队 | ✅ |
| 503 | 网络异常 | onRollback + 入队 | ✅ |

### 用户可见改善
- 失败时立刻看到"操作失败"提示，不会"瞬变瞬回"
- 设置页"📋 失败队列"可查看历史失败记录，按"重新执行"重试
- 失败队列 badge 角标实时显示未处理数量
- 网络恢复后失败项可一键重试

### 影响范围
- 新增代码 ~600 行（MutationFailureHandler、设置页 UI、错误码体系）
- 修改 4 个文件：app-1.js、app-auth.js、index.html、tbMutation/index.js
- 11 个版本号位置同步更新到 v9.0.2（versionCode 32→33）
- **建议同步部署云函数**（错误码变更要求云端配合）

---

## v9.0.1（v9.0.0 同步架构兼容性清理）

### 核心问题
v9.0.0 重构后，扫描发现多处与"服务端权威写入"哲学不符的残留代码，存在崩溃风险与架构漂移隐患。

### 根因
v9.0.0 主线改造聚焦在核心写入路径迁移，对历史防御代码（v6.4.x 时代）和个别直写 DB 入口未做全面清理。

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **P0-1** | 移除 v6.4.x 冲突对话框死代码 | 删除 `forceCloudSync`/`forceLocalToCloud`/`showMultiDeviceConflictDialog`/`resolveConflictUseCloud`/`resolveConflictUseLocal`/`resolveConflictLater`/`closeConflictDialog` 共 ~470 行。其中 `forceLocalToCloud` 引用已不存在的 LeanCloud 全局（`AV.User`/`AV.Query`/`AV.Object`/`AV.ACL`），触发时会导致 ReferenceError。 |
| **P0-2** | `DAL.recalculateBalance` 改为云函数调用 | 原实现直接 `db.collection().update({ cachedBalance })`，绕过云函数串行化与 `_.inc()` 原子性。改为 `callFunction('tbMutation', { action: 'recalculateBalance' })`。 |
| **P1-1** | 移除 `isSaving` 标志及检查 | `app-1.js:4631` 删除 `let isSaving = false`，`app-auth.js` 的 `triggerSync` 与 v7.24.1 自愈同步中的 `isSaving` 检查同步移除。v9.0.0 客户端不再写 DB，isSaving 已无意义。 |
| **P1-2** | 移除客户端直接删 DB 逻辑 | `DAL.loadAllTasks`/`loadAllTransactions` 中遇到重复时不再 `db.collection().doc().remove()`。重复检测由云函数 `addTransaction`/`saveTask` 的幂等检查保证（v9.0.0 已加），客户端重复保留以首次出现为准。 |
| **P1-3** | 移除 `USER_OPERATION_PROTECTION_MS` 死代码 | v8.2.17 引入但 v9.0.0 后未被任何代码使用。 |
| **P1-4** | 移除 `isSyncing` 标志 | `app-1.js:4630` 删除 `let isSyncing = false`，`clearAllData` 中残留的 `isSyncing = false` 同步移除。 |
| **P1-5** | 修正误导性注释 | `scheduleWatchReconnect`/`checkAndRebuildWatchers` 顶部 `[v8.2.17]` 注释移除（实际无 isSaving 检查）。`updateAllUI` 中 `isSyncing` 相关注释更新。 |

### 未在本次范围（后续版本处理）
- **P2-1**：业务层 `saveData()` 批量保存模式重构（50+ 处调用，工作量大）
- **P2-2**：`clientId` 从 mutation 参数中清理（云函数已不再使用）
- **P2-3**：`callMutation` 的 `onRollback` 完善与 mutationQueue 失败通知
- **P2-4**：profile 嵌套 `_.set()` 保护白名单扩展机制

### 影响范围
- 删除文件代码 ~520 行（死代码 + 直写 DB 路径）
- 净代码量减少约 480 行（扣除新增注释与云函数调用样板）
- 11 个版本号位置同步更新到 v9.0.1（versionCode 31→32）

---

## v9.1.0（复合 mutation + 任务锁启用）规划

> 本版本设计文档：[`docs/v9.1.0-design.md`](./docs/v9.1.0-design.md)
> **状态**：📋 设计完成，待推送 v9.0.5 后启动实施
> **核心问题**：P0-B 复合 mutation 联动缺陷（v9.0.5 评估时识别）
> **范围扩展**：同时启用 timebankTaskLock（v7.30.0 引入但未启用），与 compound 强耦合
> **关键设计**：
> - 云端 `compound` action：13 个子 action 可任意组合，云端原子执行 + 失败时反向操作
> - 客户端 `callCompoundMutation`：内部按 taskId 排序申请锁 + try/finally 释放（防死锁）
> - 业务层 0 行手工联动：声明"哪些步骤组合"即可，原子性 + 回滚由机制保证

---

## v9.0.0（服务端权威写入架构重构）

> ⚠️ **完整日志已归档**：本节仅保留概述。完整内容（架构变更、新增文件、移除的防御代码、简化的代码、tbMutation 支持的 13 个 action）见 [`docs/version-history-archive.md`](./docs/version-history-archive.md#v900服务端权威写入架构重构)

### 核心问题
v7.0.0 以来，同步机制经历了 170+ 处补丁修复（Watch 回声识别 49%、跨设备冲突 20%、余额不一致 19%、写入竞态 12%），形成"补丁螺旋"——每代补丁都在解决上代补丁引入的新问题。根因：客户端同时承担"写入者"和"同步决策者"，缺乏权威冲突仲裁。

### 根因
客户端直接写入 DB → Watch 收到自身回声 → 需要 pendingRegistry 识别 → 多设备并发写入 → 需要 clientId 感知合并 → 余额客户端增量更新可能漂移 → 需要强制重算。v7.28.0 曾尝试云函数写入但因同步等待 2-5 秒而回退。

### 架构变更（一句话）
所有数据变更通过云函数 `tbMutation` 统一执行（13 个 action：addTransaction / updateTransaction / deleteTransaction / saveTask / startTask / stopTask / saveProfile / ...），客户端不再直接写入数据库。详见 archive。

---

## v8.2.15（跨设备 running 状态冲突修复）

### 核心问题
Android 端完成任务后，Web 端 stale running 状态覆盖完成状态，导致交易丢失。

### 根因
5 个独立根因：缺少跨设备乐观锁，`clientId` 感知合并机制不完善。

### 6 项修复
| 修复项 | 关键逻辑 |
|--------|---------|
| `DAL.startTask` UPDATE→ADD 回退 | UPDATE 失败时清缓存，回退 ADD |
| `DAL.updateRunningTask` 存在性守卫 | 检测 not found 时清理缓存和任务 |
| `tb_running` 增加 `lastUpdatedAt` | 所有写入附带时间戳 |
| `DAL.loadAll` 跨设备合并 | clientId 感知：本地有则保留，本机无则接受云端 |
| `applyDataState` 跨设备保护 | clientId 感知合并 |
| Watch remove 清理缓存 | 远程删除时同步清缓存 |

### 合并规则
- 云端 clientId === 本机 → 信任云端
- 云端 clientId !== 本机且本地有 → **保留本地**
- 云端 clientId !== 本机且本地无 → 接受云端

---

## v8.2.14（利息计算交叉校验 + 历史修复功能）

### 改动 1：余额交叉校验
- 新增 `calculateEndingBalanceFromTransactions()` 辅助函数
- 若 `|cached - calculated| > 1` 秒，使用计算值并修正账本缓存

### 改动 2：历史修复功能
- 新增 `recalculateAllInterest()` 函数（设置页按钮触发）
- 流程：标记 undone → 清空账本 → 从 firstEnabledAt 重新结算

---

## v8.2.13（统一使用东八区时区）

- 前端 `getLocalDateString`：使用 `Intl.DateTimeFormat` 指定 `Asia/Shanghai`
- Android `getAppScreenTimeForDate`：使用 `TimeZone.getTimeZone("Asia/Shanghai")`

---

## v8.2.12（自动检测补录日期匹配修复）

- `hasAutoDetectTransactionForDate`：优先使用 `originalDate`，回退 timestamp
- `getTaskRecordedTimeForDateIncludeAuto`：同样优先 `originalDate`
- `parseTimeFromDescription`：新增支持 `(漏记30分钟, ×1.2惩罚)` 格式

---

## v8.2.11（屏幕时间手动记录 + 时区一致性修复）

- 新增 `addManualScreenTimeRecord()` 函数（设置页 UI）
- `autoDetectAppUsage`：统一使用 `getLocalDateString(new Date())`

---

## v8.2.10（负余额惩罚强制启用 + 金融设置云端同步修复）

- `shouldApplyNegativeBalancePenalty()`：移除开关，始终返回 true
- `DAL.saveProfile`：添加 `financeSettings`/`interestLedger` 的 `_.set()` 自动包装

---

## 早期版本索引（压缩摘要）

| 版本 | 核心内容 |
|------|---------|
| v8.2.9 | 补录弹窗 try/finally 保护 |
| v8.2.8 | 大数据量秒开 + 后台增量同步 |
| v8.2.7 | saveTask 数据保护：clientId、失败重试队列、字段级合并 |
| v8.2.6 | 登录态误报修复、后台延迟修复 |
| v8.2.5 | 通透模式 UI 修复 |
| v8.2.4 | 任务完成后余额双倍计算修复 |
| v8.2.3 | 后台结束任务 UI 僵死修复 |
| v8.2.2 | Watch 连接僵死 + 手动同步失效修复 |
| v8.2.1 | 全量同步覆盖 pending 交易修复 |
| v8.2.0 | AI 统一认知架构 |
| v8.1.0 | AI 增强：Kimi 模型、CLI 部署 |
| v8.0.0 | AI 云端方案：DeepSeek + HTTP 访问服务 |
| v7.39.x | Habit System 3.0 重构 |
| v7.38.0 | pendingRegistry 机制 |
| v7.37.x | Watch 去重修复、clientId 修复 |
| v7.36.x | 性能优化、AlarmManager 修复 |

---

# 附录：快速参考

## 常用搜索关键词

| 需求 | 关键词 |
|------|--------|
| 任务逻辑 | `renderTasks`, `startTask`, `stopTask` |
| 交易操作 | `addTransaction`, `writeTransaction` |
| 睡眠代码 | `sleepSettings`, `calculateSleepDuration` |
| 主题切换 | `themePreference`, `applyTheme` |
| 屏幕时间 | `screenTime`, `collectScreenTime` |
| 自动检测 | `autoDetectAppUsage`, `recordAutoDetectRawUsage` |
| 金融系统 | `financialSystem`, `balance` |
| 习惯系统 | `rebuildHabitStreak`, `computeHabitStreakFromTransactions` |
| Watch 监听 | `subscribeAll`, `unsubscribeAll`, `manualSync` |
| DAL 对象 | `const DAL =` |
| pendingRegistry | `addPending`, `removePending`, `isPending` |
| callMutation | `callMutation`, `flushMutationQueue`, `mutationQueue` |

## 调试脚本

| 脚本 | 用途 |
|------|------|
| `scripts/inspect_segment.ps1` | 分析代码段括号匹配 |
| `scripts/pre-push-check.ps1` | 推送前检查 |
| `scripts/analyze_interest*.ps1` | 利息数据分析 |
| `scripts/verify_balance.ps1` | 余额验证 |

## 关键文件

| 文件 | 用途 |
|------|------|
| `cloudbase-functions/timebankAI/deploy-guide.md` | AI 云函数部署 |
| `cloudbase-functions/taskLock-deploy-guide.md` | 分布式锁部署 |
| `external-ai-analysis-prompt.md` | 外部 AI 分析规范 |

## 紧急故障排查

**应用无法启动**：检查 `adb logcat` → 确认 `index.html` 语法 → 验证 JS 加载顺序

**数据不同步**：检查网络 → 确认环境 ID → 查看 Console → 验证云函数部署

**余额异常**：检查重复交易 → 验证 pendingRegistry → 查看 Watch 状态 → 检查跨设备冲突
