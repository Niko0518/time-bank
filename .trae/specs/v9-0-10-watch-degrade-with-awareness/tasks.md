# Tasks — v9.0.10 Watch 修复 + Bug 完善 + 用户感知

> 版本：v9.0.10（versionCode 39→40）
> 实施位置：`android_project/app/src/main/assets/www/`（默认 Android 源）
> 推送：等用户指令后再同步根目录 + git push

## 用户原话驱动的设计原则（v9.0.10 完善版）
1. **Watch 必须坚持**——不替换为轮询、不废弃
2. **控制台必须报错**——5 处 onError 保留 console.error 级别，不降噪
3. **修复优先于降级**——3 次失败太激进，提升为 8 次；降级后自愈探针每 60s 自动探活，**不等用户操作**
4. **降级时用户必须看到**——顶部固定状态条（不依赖 tab）+ 状态条文案显式标注"已暂停"（不是"异常"）+ 设置页重置按钮 + 点击状态条看诊断面板
5. **降级不静默**——状态变红时持续显示自愈倒计时 + 诊断面板 + 控制台 error 持续输出

---

## Group A: Watch 修复（核心）

### A1: 主动心跳保活机制（根因修复）

- [ ] Task A1.1: 在 `js/app-1.js` 顶部新增 `__startWatchHeartbeat()` 函数
  - 每 20s 调一次 `db.collection('tb_profile').limit(1).get()`
  - 成功时静默（不输出日志），更新 `__watchLastHeartbeatAt`
  - 失败时静默（不报错，依赖 onError 处理）

- [ ] Task A1.2: 在 `js/app-1.js` 顶部新增 `__stopWatchHeartbeat()` 函数
  - clearInterval 清理定时器

- [ ] Task A1.3: 在 `DAL.subscribeAll` 成功后调 `__startWatchHeartbeat()`
  - 文件：`js/app-1.js` 附近（subscribeAll 末尾）
  - 成功订阅 → 启动心跳保活

- [ ] Task A1.4: 在 `DAL.unsubscribeAll` 调 `__stopWatchHeartbeat()`
  - 取消订阅 → 停止心跳

### A2: 智能重连策略（8 次失败上限——从 3 提升）

- [ ] Task A2.1: 修改 `MAX_RECONNECT_ATTEMPTS` 从 3 → 8
  - 文件：`js/app-1.js` 顶部
  - 关键常量 `MAX_RECONNECT_ATTEMPTS = 8`（原 3）
  - 8 次失败约 1-2 分钟到达（指数退避）

- [ ] Task A2.2: 失败达到上限时停止自动重连 + 触发状态变化
  - 位置：`js/app-1.js` `scheduleWatchReconnect` 函数 try/catch 的 catch 块
  - 新增：
    ```js
    if (newAttempts >= MAX_RECONNECT_ATTEMPTS) {
        __watchDegradeStatus = 'paused';  // [v9.0.10 完善] 改为 'paused'，不再是 'down'
        __recordWatchDegrade();  // 持久化
        updateCloudStatusUI();
        console.error('❌ [Watch] 自动重连已停止（连续 8 次失败），启动自愈探针每 60s 探活');
        __startSelfHealingProbe();  // [v9.0.10 完善] 启动自愈探针，不等用户操作
        return;  // 停止调度
    }
    ```

- [ ] Task A2.3: 重连成功后清零状态
  - 位置：`scheduleWatchReconnect` 成功块
  - `__watchDegradeStatus = 'ok'` + 持久化 + `updateCloudStatusUI()` + 停止自愈探针

### A3: 降级期间自愈探针（关键改进！v9.0.10 完善）

- [ ] Task A3.1: 新增 `__startSelfHealingProbe()` 函数
  - 位置：`js/app-1.js` 顶部
  - 实现：每 60s 调一次 `db.collection('tb_profile').limit(1).get()` 探活
  - 探活成功 → 立即 `unsubscribeAll` + `subscribeAll` 重建 + 停止探针 + 状态恢复 🟢
  - 探活失败 → 倒计时减 1，继续等待
  - **永不放弃**

- [ ] Task A3.2: 新增 `__stopSelfHealingProbe()` 函数
  - clearInterval 清理
  - 状态恢复 🟢 时调

- [ ] Task A3.3: 在 `__recordWatchDegrade()` 中更新自愈倒计时
  - 持久化字段增加 `probeCountdown: 60`
  - UI 实时显示倒计时

- [ ] Task A3.4: 启动时从 `localStorage` 恢复自愈探针
  - 如果上次状态是 `paused`，启动时立即启动自愈探针

### A4: 控制台保留 error（用户要求）

- [ ] Task A4.1: **不做任何降噪改造**——5 处 onError 保留 `console.error`
  - 文件：`js/app-1.js` 5 处
  - 验证：错误频率因 A1 心跳保活自然降低（从 30s/次 → 接近 0）
  - **不引入** `__isWatchTimeoutError` 工具、**不引入** unhandledrejection 监听器

---

## Group B: 顶部固定 4 状态指示器（强化用户感知）

### B1: 状态变量扩展

- [ ] Task B1.1: 在 `js/app-1.js` 顶部扩展状态变量
  - `let __watchDegradeStatus = 'ok';`  // 'ok' | 'degraded' | 'paused'（v9.0.10 完善：'paused' 替代 'down'）
  - `let __watchFirstFailAt = 0;`
  - `let __watchFailCount = 0;`
  - `let __watchLastHeartbeatAt = 0;`
  - **新增**：`let __watchLastReason = '';`  // 'network' | 'sdk_timeout' | 'unknown'
  - **新增**：`let __watchSelfHealingCountdown = 60;`

- [ ] Task B1.2: 修改 `__loadWatchDegradeState()` 读取新字段
  - 启动时从 `localStorage.tb_watchDegradeState` 读状态
  - 包含 `lastReason` / `probeCountdown`

- [ ] Task B1.3: 修改 `__recordWatchDegrade()` 写入新字段
  - 写 `{firstFailAt, lastFailAt, failCount, status, lastReason, probeCountdown}`

- [ ] Task B1.4: 在 `initApp` 启动早期调 `__loadWatchDegradeState()`

### B2: 顶部固定状态条 UI（强化）

- [ ] Task B2.1: 在 `index.html` `<body>` 第一个子元素位置添加 `#cloudStatusBar`
  - 位置：body 第一个子元素
  - 默认 `class="cloud-status-bar status-ok"`
  - `onclick="showWatchDiagnostics()"`

- [ ] Task B2.2: 重写 `updateCloudStatusUI()` 函数
  - 文件：`js/app-1.js`
  - 4 状态：
    - 🟢 已连接
    - 🟡 心跳保活中 (2/8)
    - 🔴 Watch 已暂停（自愈中：Xs）
    - ⚫ 未登录
  - 状态判定基于 `__watchDegradeStatus` + 实时数据

- [ ] Task B2.3: CSS 添加 `.cloud-status-bar` 样式
  - 文件：`index.html` 内联 `<style>` 或外部 CSS
  - 4 状态颜色：绿色 / 黄色 / 红色 / 灰色
  - 顶部 fixed 位置（不被 tab 切换影响）

### B3: 诊断面板（点击状态条弹出）

- [ ] Task B3.1: 在 `index.html` 添加 `#watchDiagnosticsModal` 弹窗
  - 默认 `hidden`
  - 字段：状态 / 降级时间 / 最后心跳时间 / 失败原因 / 重试次数 / 自愈倒计时
  - 按钮：「立即重试」/「查看控制台日志」/「关闭」

- [ ] Task B3.2: 新增 `showWatchDiagnostics()` 函数
  - 文件：`js/app-auth.js` 或 `js/app-1.js`
  - 填充弹窗字段
  - 显示弹窗

- [ ] Task B3.3: 新增 `closeWatchDiagnostics()` 函数
  - 关闭弹窗

- [ ] Task B3.4: 「立即重试」按钮调用 `handleResetWatch()`

### B4: 触发点

- [ ] Task B4.1: 5 处 onError 失败时调 `__markWatchFailure(reason)` + `updateCloudStatusUI()`
  - 文件：`js/app-1.js` 5 处
  - 失败原因分类：网络断开 / SDK 超时 / 未知

- [ ] Task B4.2: `scheduleWatchReconnect` 成功时调 `__markWatchSuccess()` + `updateCloudStatusUI()`

- [ ] Task B4.3: 状态变红时控制台输出最后一次警告
  - `console.error('❌ [Watch] Watch 已暂停自动重连（自愈探针 60s 后探活）')`

---

## Group C: 设置页"重置 Watch"按钮 + 自愈倒计时

- [ ] Task C1: 在 `index.html` 设置页增加按钮 + 倒计时显示
  - 位置：失败队列按钮附近
  - id: `resetWatchButton`
  - 默认 `class="hidden"`
  - 文案：🔄 重置 Watch 连接
  - 旁加 `<span id="selfHealingCountdown">自愈中：60s</span>` 倒计时
  - `onclick="handleResetWatch()"`

- [ ] Task C2: 在 `js/app-auth.js` 新增 `handleResetWatch()` 函数
  ```js
  async function handleResetWatch() {
      if (!confirm('确认重置 Watch 连接？\n\n将清零重试计数器并尝试重建连接。')) return;
      
      // 重置所有状态
      Object.keys(watchReconnectAttempts).forEach(k => watchReconnectAttempts[k] = 0);
      __watchDegradeStatus = 'ok';
      __watchFailCount = 0;
      __watchFirstFailAt = 0;
      __watchLastReason = '';
      __watchSelfHealingCountdown = 60;
      __recordWatchDegrade();
      __stopSelfHealingProbe();  // [v9.0.10 完善] 停止自愈探针
      updateCloudStatusUI();
      
      // 立即重新订阅
      try {
          await DAL.unsubscribeAll();
          await DAL.subscribeAll();
          // 订阅成功后会自动启动心跳保活（A1.3）
          showToast('✅ Watch 连接已重置');
      } catch (e) {
          showToast('❌ 重置失败：' + e.message);
          __watchDegradeStatus = 'paused';
          __startSelfHealingProbe();  // 启动自愈探针
          updateCloudStatusUI();
      }
  }
  ```

- [ ] Task C3: `updateCloudStatusUI()` 中联动显示按钮
  - 状态变红时：`document.getElementById('resetWatchButton')?.classList.remove('hidden')`
  - 状态恢复时：`classList.add('hidden')`

- [ ] Task C4: 倒计时实时更新
  - 自愈探针每 60s tick 时减 1
  - UI 同步显示「自愈中：Xs」

---

## Group D: Bug 修复层

### D1: 时间参数规整（修 Bug ①）

- [ ] Task D1.1: 在 `js/app-2.js` 顶部新增 `__normalizeDate(input, contextLabel)` 工具
- [ ] Task D1.2: `getPreviousPeriodEnd` 入口加守卫
- [ ] Task D1.3: `stepToNextPeriodEnd` 入口加守卫

### D2: 安全事件绑定（修 Bug ②）

- [ ] Task D2.1: 在 `js/app-auth.js` 顶部新增 `__safeBind` / `__safeBindAll` 工具
- [ ] Task D2.2: 重构 `setupTaskModalEventListeners`
- [ ] Task D2.3: 重构 `setupReportEventListeners`

### D3: 启动隔离

- [ ] Task D3.1: 在 `js/app-1.js` 顶部新增 `__safeSetup` 工具
- [ ] Task D3.2: initApp 中所有 setupXxx 调用用 `__safeSetup` 包裹

---

## Group E: 持久化扫描 + SW 升级 + 版本号

- [ ] Task E1: 扫 `localStorage` 时间字段安全性（结论：均为 ISO 字符串，安全）
- [ ] Task E2: 升级 `sw.js` CACHE_NAME → `timebank-v9-0-10`
- [ ] Task E3: 同步 11 处版本号
- [ ] Task E4: 撰写 `AGENTS.md` v9.0.10 技术日志

---

## Task Dependencies

- Group A（Watch 修复）：A3 依赖 A1+A2；A2 依赖 A1
- Group B（状态指示器）：B1 独立；B2 依赖 B1；B3 依赖 B2；B4 依赖 B2
- Group C（重置按钮）：依赖 B2 + A3
- Group D（Bug 修复）：独立
- Group E（版本号）：依赖所有业务代码

## 验证策略

每个 Group 完成后：
1. 单元逻辑自检（修改的代码段 review）
2. 边界条件模拟（断网 / 删 id / 传 null Date）
3. 全部完成后整体回归

### 关键回归场景（v9.0.10 强化）

- [ ] 启动 App → 顶部固定状态条显示 🟢「已连接」+ 心跳保活 20s 一次
- [ ] 断网 1 分钟 → 8 次重连失败（不是 3 次）→ 状态 🔴 + 启动自愈探针 + 倒计时显示
- [ ] 倒计时到 0 → 自愈探针尝试 → 仍然断网 → 倒计时重新 60s
- [ ] 断网 30 秒后恢复网络 → 自愈探针下次 tick 检测到 → 自动重建 → 状态恢复 🟢（**用户无需操作**）
- [ ] 点击状态条 → 弹出诊断面板 → 显示所有内部状态
- [ ] 手动点设置页"重置 Watch" → 弹确认 → 立即重建
- [ ] 状态变红时刷新 → 顶部状态条继续 🔴「Watch 已暂停（自愈中：Xs）」+ 自愈探针后台跑
- [ ] 删除 `isHabitToggle` → App 启动不崩
- [ ] 把 `app-2.js:3782` 改为 `null` → 戒除习惯 weekly 不崩

## 不在本次范围（明确排除）

- ❌ 任何"控制台降噪"代码（用户要求保留 error）
- ❌ 替换 Watch 为轮询（用户明确拒绝）
- ❌ 替换 Watch 为其他同步机制
- ❌ `getPeriodStartDatePureHabit` 的 Date 守卫（v9.1.0 处理）
- ❌ 云函数变更
