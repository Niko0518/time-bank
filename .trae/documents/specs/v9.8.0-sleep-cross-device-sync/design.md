# v9.8.0 Design：睡眠系统云端统一（与任务系统一致）

> **创建时间**：2026-06-15
> **依赖**：[requirements.md](./requirements.md)
> **状态**：📝 Draft（v2，简化方案）
> **核心原则**：复用任务系统 `tb_running` 的 per-user 统一 + `clientId` 防回环模式

---

## 1. 架构对比

### 1.1 任务系统（参考模式）

```javascript
// app-2.js L3689 — 任务开始
db.collection(TABLES.RUNNING).add({
    data: { taskId, clientId, deviceId: clientId, _openid: currentUid }
})

// app-1.js L4097-4136 — 任务 watch
const remoteClientId = doc.clientId || doc.data?.clientId;
if (remoteClientId && remoteClientId === clientId) {
    // 本机回环，跳过
    return;
}
// 应用云端状态
runningTasks.set(taskId, doc);
```

**核心要点**：
- per-user 共享（`tb_running` 按 `_openid` 分，不按 `deviceId` 分）
- `clientId` 字段防本机回环
- 任一端写、任一端读，无"远程"概念

### 1.2 v9.8.0 睡眠系统（目标）

```javascript
// app-sleep.js — saveSleepState（v9.8.0）
DAL.saveProfile({
    sleepStateShared: _.set({
        isSleeping, sleepStartTime, lastUpdated, clientId: clientId  // ← 与任务一致的防回环字段
    })
})

// app-1.js Profile watch（v9.8.0）
const remoteClientId = doc.sleepStateShared?.clientId;
if (remoteClientId && remoteClientId === clientId) return;  // 本机回环
applySleepStateFromCloud(doc.sleepStateShared, 'watch');
```

---

## 2. 数据模型

### 2.1 tb_profile 字段变更

| 字段 | v9.7.4 | v9.8.0 | 用途 |
|------|--------|--------|------|
| `sleepSettingsShared` | 闲置 | **写入** | 跨设备统一睡眠设置 |
| `deviceSleepSettings.${deviceId}` | 写入 | **继续写入** | 向后兼容老版本（v9.7.x 仍能读） |
| `sleepStateShared` | 闲置 | **写入** | 跨设备统一睡眠状态 |
| `sleepStateShared.clientId` | 无 | **新增** | 防本机回环 |
| `deviceSleepState.${deviceId}` | 写入 | **不再写入** | 仅作升级回退；老用户一次性迁移到 sleepStateShared |
| `deviceSleepState.${deviceId}.migrated` | 无 | **新增** | 升级标记，迁移完成后置 true |

### 2.2 字段 schema

```javascript
// sleepSettingsShared（v9.8.0 权威）
{
    enabled: true,
    plannedBedtime: '23:00',           // [v9.8.0] 新默认
    plannedWakeTime: '08:00',          // [v9.8.0] 新默认
    targetDurationMinutes: 495,        // [v9.8.0] 8h15m
    durationTolerance: 45,
    toleranceReward: 45,
    countdownSeconds: 30,
    autoDetectWake: true,
    wakeDetectThreshold: 5,
    earlyBedtimeRate: 0.5,
    lateBedtimeRate: 1,                // [v9.8.0] 新默认
    earlyWakeRate: 1,
    lateWakeRate: 0.5,
    durationDeviationRate: 1,
    napDurationMinutes: 30,
    napMinDurationMinutes: 240,
    napReward: 15,
    napAlarmEnabled: true,
    napVibrateEnabled: true,
    nightAlarmMode: 'wakeTime',
    sleepAlarmEnabled: true,
    autoSyncSystemAlarm: true,
    earnCategory: null,
    spendCategory: null,
    cardMode: 'auto',
    napEnabled: true,
    napMaxDurationMinutes: 60,
    lastUpdated: '2026-06-15T12:34:56.789Z'
}

// sleepStateShared（v9.8.0 权威）
{
    isSleeping: true,
    sleepStartTime: 1718444400000,    // ms timestamp
    lastUpdated: 1718444400123,       // ms timestamp
    clientId: 'client_1729_abc123def' // [v9.8.0] 新增，防本机回环
}
```

---

## 3. 模块变更

| 模块 | 变更类型 | 关键点 |
|------|----------|--------|
| `app-reports.js` | 改 4 个默认值常量 | L7585-7596 |
| `app-sleep.js` | 改 saveSleepSettings / saveSleepState / initSleepSettings / applySleepStateFromCloud | 4 个函数 |
| `app-1.js` | 改 Profile watch onChange | L4183 附近 |
| `index.html` | 仅版本号 + 用户日志 | 9 处版本号 + L1470 日志 |
| `sw.js` | CACHE_NAME | L1, L13 |
| `build.gradle` | versionCode / versionName | L15-L16 |
| `docs/version-changelog.md` | 新增 v9.8.0 章节 | — |
| `css/main.css` | **无改动** | — |

---

## 4. 关键函数 diff

### 4.1 `app-reports.js` — 默认值（不变格式，仅 4 个常量）

```diff
 let sleepSettings = {
     enabled: true,
-    plannedBedtime: '23:30',
-    plannedWakeTime: '08:15',
-    targetDurationMinutes: 525,
+    plannedBedtime: '23:00',         // [v9.8.0] 23:00
+    plannedWakeTime: '08:00',        // [v9.8.0] 08:00
+    targetDurationMinutes: 495,      // [v9.8.0] 8h15m
     durationTolerance: 45,
     toleranceReward: 45,
     countdownSeconds: 30,
     autoDetectWake: true,
     wakeDetectThreshold: 5,
-    earlyBedtimeRate: 0.5,
-    lateBedtimeRate: 0.5,
+    earlyBedtimeRate: 0.5,           // 不变
+    lateBedtimeRate: 1,              // [v9.8.0] 1
     earlyWakeRate: 1,
     lateWakeRate: 0.5,
     ...
 };
```

### 4.2 `app-sleep.js` — `saveSleepSettings()` 双写

**位置**：[L1-L82](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L1-L82)

```diff
 function saveSleepSettings() {
     sleepSettings.lastUpdated = new Date().toISOString();
     const settingsJson = JSON.stringify(sleepSettings);
     
     if (typeof Android !== 'undefined' && Android.saveSleepSettingsNative) { ... }
     try { localStorage.setItem('sleepSettings', settingsJson); } catch (e) { ... }
     
     if (isLoggedIn() && DAL.profileId && currentDeviceId) {
         const cloudSettings = { ... 22 个字段 ... };
         
-        const updateKey = `deviceSleepSettings.${currentDeviceId}`;
-        DAL.saveProfile({ [updateKey]: _.set(cloudSettings) })
-            .then(...).catch(...);
+        // [v9.8.0] 双写：deviceSleepSettings.${currentDeviceId}（向后兼容）+ sleepSettingsShared（v9.8.0 跨设备权威）
+        const updateKey = `deviceSleepSettings.${currentDeviceId}`;
+        DAL.saveProfile({ 
+            [updateKey]: _.set(cloudSettings),
+            sleepSettingsShared: _.set(cloudSettings)
+        })
+            .then(() => console.log('[saveSleepSettings] 云端双写成功'))
+            .catch(e => console.error('[saveSleepSettings] 云端同步失败:', e.message));
     }
 }
```

### 4.3 `app-sleep.js` — `saveSleepState()` 改写 shared

**位置**：[L82-L122](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L82-L122)

```diff
 function saveSleepState() {
     sleepState.lastUpdated = Date.now();
     
     if (window.Android?.saveSleepStateNative) { ... }  // Android 原生（不变）
     localStorage.setItem('sleepState', JSON.stringify(sleepState));  // localStorage（不变）
     
     if (isLoggedIn() && DAL.profileId && currentDeviceId) {
-        const criticalState = {
-            isSleeping: sleepState.isSleeping,
-            sleepStartTime: sleepState.sleepStartTime,
-            lastUpdated: sleepState.lastUpdated
-        };
-        
-        const updateKey = `deviceSleepState.${currentDeviceId}`;
-        DAL.saveProfile({ [updateKey]: _.set(criticalState) })
-            .then(...).catch(...);
+        // [v9.8.0] 改为写入 sleepStateShared（per-user 统一），与任务系统 tb_running 一致
+        const sharedState = {
+            isSleeping: sleepState.isSleeping,
+            sleepStartTime: sleepState.sleepStartTime,
+            lastUpdated: sleepState.lastUpdated,
+            clientId: clientId  // [v9.8.0] 防本机回环（clientId 在 app-1.js L49 定义）
+        };
+        
+        DAL.saveProfile({ sleepStateShared: _.set(sharedState) })
+            .then(() => console.log('[saveSleepState] 云端同步成功:', sharedState.isSleeping ? '睡眠中' : '未睡眠'))
+            .catch(e => console.error('[saveSleepState] 云端同步失败:', e.message));
     }
 }
```

### 4.4 `app-sleep.js` — `applySleepStateFromCloud()` 加 clientId 防回环 + 自动结算

**位置**：[L336-L357](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L336-L357)

```diff
 function applySleepStateFromCloud(cloudState, source = 'cloud') {
     if (!cloudState) return false;
+    
+    // [v9.8.0] 防本机回环（参考 tb_running L4107-L4119）
+    if (source === 'watch' && cloudState.clientId && clientId && cloudState.clientId === clientId) {
+        console.log('[applySleepStateFromCloud] 跳过本机回环');
+        return false;
+    }
+    
     const cloudUpdated = cloudState.lastUpdated || 0;
     const localUpdated = sleepState.lastUpdated || 0;
+    const wasSleeping = sleepState.isSleeping === true;
+    
     if (cloudUpdated > localUpdated) {
         if (cloudState.isSleeping !== undefined) sleepState.isSleeping = cloudState.isSleeping;
         if (cloudState.sleepStartTime !== undefined) sleepState.sleepStartTime = cloudState.sleepStartTime;
         if (cloudState.isNapping && cloudState.napStartTime && !cloudState.isSleeping) { ... }
         sleepState.lastUpdated = cloudUpdated;
         localStorage.setItem('sleepState', JSON.stringify(sleepState));
         if (window.Android?.saveSleepStateNative) { ... }
         console.log('[Sleep] 已应用云端状态:', source, 'ts=', cloudUpdated);
+        
+        // [v9.8.0] 检测"被其他端结束睡眠"：触发本地结算（与 B 端 endSleep 行为一致）
+        if (source === 'watch' && wasSleeping && cloudState.isSleeping === false && sleepState.sleepStartTime) {
+            console.log('[applySleepStateFromCloud] 检测到被其他端结束睡眠，触发结算');
+            const startTime = sleepState.sleepStartTime;
+            const wakeTime = Date.now();
+            const durationMinutes = Math.floor((wakeTime - startTime) / 60000);
+            const detectedType = (typeof detectSleepType === 'function') 
+                ? detectSleepType(startTime, wakeTime) 
+                : 'night';
+            if (typeof doSleepSettlement === 'function') {
+                doSleepSettlement(startTime, wakeTime, durationMinutes, detectedType);
+            }
+        }
+        
         return true;
     }
     return false;
 }
```

### 4.5 `app-sleep.js` — `initSleepSettings()` 读 shared 优先 + 升级迁移

**位置**：[L373-L576](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L373-L576)

```diff
 function initSleepSettings() {
     // ... Android 原生 / localStorage 加载（不变）...
     
     if (isLoggedIn() && currentDeviceId) {
+        // [v9.8.0] 升级迁移：deviceSleepState → sleepStateShared（一次性）
+        if (DAL.profileData?.deviceSleepState && !DAL.profileData?.sleepStateShared) {
+            const latest = getLatestDeviceState(DAL.profileData.deviceSleepState);
+            if (latest && latest.state) {
+                console.log('[initSleepSettings] 升级迁移: deviceSleepState[' + latest.deviceId + '] → sleepStateShared');
+                const migrated = {
+                    isSleeping: latest.state.isSleeping,
+                    sleepStartTime: latest.state.sleepStartTime,
+                    lastUpdated: latest.state.lastUpdated || Date.now(),
+                    clientId: 'migrated-from-device'
+                };
+                DAL.saveProfile({ sleepStateShared: _.set(migrated) }).catch(e => 
+                    console.error('[initSleepSettings] 状态迁移失败:', e.message));
+            }
+        }
+        
+        // [v9.8.0] 升级迁移：deviceSleepSettings → sleepSettingsShared（一次性）
+        if (DAL.profileData?.deviceSleepSettings && !DAL.profileData?.sleepSettingsShared) {
+            const latest = getLatestDeviceSettings(DAL.profileData.deviceSleepSettings);
+            if (latest && latest.settings) {
+                console.log('[initSleepSettings] 升级迁移: deviceSleepSettings[' + latest.deviceId + '] → sleepSettingsShared');
+                const migrated = { ...latest.settings };
+                if (!migrated.lastUpdated) migrated.lastUpdated = new Date().toISOString();
+                DAL.saveProfile({ sleepSettingsShared: _.set(migrated) }).catch(e => 
+                    console.error('[initSleepSettings] 设置迁移失败:', e.message));
+                // 本地也应用
+                sleepSettings = { ...sleepSettings, ...migrated };
+                sleepSettings.lastUpdated = migrated.lastUpdated;
+                localStorage.setItem('sleepSettings', JSON.stringify(sleepSettings));
+            }
+        }
+        
+        // [v9.8.0] 读 sleepSettingsShared（v9.8.0 权威）
+        const sharedSettings = DAL.profileData?.sleepSettingsShared;
+        if (sharedSettings) {
+            sleepUpdated = applySleepSettingsFromCloud(sharedSettings, 'init-shared', true) || sleepUpdated;
+        } else {
+            // [v9.8.0] 回退：per-device（老版本兼容）
+            const mySleepSettings = DAL.profileData?.deviceSleepSettings?.[currentDeviceId];
+            if (mySleepSettings) {
+                sleepUpdated = applySleepSettingsFromCloud(mySleepSettings, 'init-device', false) || sleepUpdated;
+            }
+        }
+        
+        // [v9.8.0] 读 sleepStateShared（v9.8.0 权威）
+        const sharedState = DAL.profileData?.sleepStateShared;
+        if (sharedState) {
+            sleepUpdated = applySleepStateFromCloud(sharedState, 'init-shared') || sleepUpdated;
+        } else {
+            // [v9.8.0] 回退：per-device（老版本兼容）
+            const myState = DAL.profileData?.deviceSleepState?.[currentDeviceId];
+            if (myState) {
+                sleepUpdated = applySleepStateFromCloud(myState, 'init-device') || sleepUpdated;
+            }
+        }
-        // 旧代码（v9.7.4）已删除
-        // let cloudSleep = deviceMap[currentDeviceId];
-        // let cloudFormat = 'new';
-        // if (!cloudSleep && DAL.profileData?.sleepSettingsShared) { ... }
-        // ...
     }
     
     // 分类标签从云端恢复（不变）
 }
```

### 4.6 `app-1.js` — Profile watch onChange

**位置**：[L4183-L4220](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4183-L4220)

```diff
 watchers.profile = db.collection(TABLES.PROFILE)
     .where({ _openid: currentUid })
     .watch({
         onChange: (snapshot) => {
             ...
             for (const change of snapshot.docChanges) {
                 if (change.dataType === 'update') {
                     const doc = change.doc;
                     profileData = doc;
                     ...
                     
-                    // v9.7.4 旧逻辑
-                    const mySleepSettings = doc.deviceSleepSettings?.[currentDeviceId] || doc.sleepSettingsShared;
-                    if (mySleepSettings) {
-                        const isDeviceSpecific = !!doc.deviceSleepSettings?.[currentDeviceId];
-                        sleepUpdated = applySleepSettingsFromCloud(mySleepSettings, 'watch', isDeviceSpecific) || sleepUpdated;
-                    }
-                    const mySleepState = doc.deviceSleepState?.[currentDeviceId] || doc.sleepStateShared;
-                    if (mySleepState) {
-                        sleepUpdated = applySleepStateFromCloud(mySleepState, 'watch') || sleepUpdated;
-                    }
+                    // [v9.8.0] 跨设备统一：读 sleepSettingsShared 优先（force=true）
+                    if (doc.sleepSettingsShared) {
+                        sleepUpdated = applySleepSettingsFromCloud(doc.sleepSettingsShared, 'watch', true) || sleepUpdated;
+                    } else if (doc.deviceSleepSettings?.[currentDeviceId]) {
+                        // 回退：per-device（老版本兼容）
+                        sleepUpdated = applySleepSettingsFromCloud(doc.deviceSleepSettings[currentDeviceId], 'watch', false) || sleepUpdated;
+                    }
+                    
+                    // [v9.8.0] 跨设备统一：读 sleepStateShared（带 clientId 防回环）
+                    if (doc.sleepStateShared) {
+                        sleepUpdated = applySleepStateFromCloud(doc.sleepStateShared, 'watch') || sleepUpdated;
+                    } else if (doc.deviceSleepState?.[currentDeviceId]) {
+                        // 回退：per-device（老版本兼容）
+                        sleepUpdated = applySleepStateFromCloud(doc.deviceSleepState[currentDeviceId], 'watch') || sleepUpdated;
+                    }
                     
                     if (sleepUpdated) {
                         updateSleepCardVisibility();
                         updateSleepSettingsSummary();
                         updateSleepCard();
                     }
                 }
             }
         },
         ...
     });
```

---

## 5. 完整同步链路示例

### 5.1 A 端入睡 → B 端同步
```
1. A 端用户点击"开始睡眠" → handleStartSleep() → sleepState.isSleeping = true; saveSleepState()
2. saveSleepState() 写:
   - localStorage (A)
   - Android 原生 (A)
   - 云端 sleepStateShared = { isSleeping: true, sleepStartTime: 1718444400000, lastUpdated: 1718444400123, clientId: 'A_clientId' }
3. B 端 Profile watch 触发 → onChange
4. B 端读取 doc.sleepStateShared → applySleepStateFromCloud(cloudState, 'watch')
5. applySleepStateFromCloud 检测 cloudState.clientId !== B 的 clientId → 应用
6. B 端 sleepState.isSleeping = true; B 端 UI 显示睡眠卡片"睡眠中"
```

### 5.2 B 端起床 → A 端结算
```
1. B 端用户点击"起床" → endSleep() → sleepState.isSleeping = false; saveSleepState()
2. saveSleepState() 写云端 sleepStateShared = { isSleeping: false, sleepStartTime: null, lastUpdated: now, clientId: 'B_clientId' }
3. A 端 Profile watch 触发
4. A 端 applySleepStateFromCloud 检测:
   - cloudState.clientId !== A 的 clientId → 应用
   - wasSleeping (true) && cloudState.isSleeping (false) → 触发 doSleepSettlement
5. A 端执行 doSleepSettlement → 入账
6. B 端不需要重复结算（B 端 watch 也触发，但 B 端的 wasSleeping 已是 false，跳过结算）
```

### 5.3 A 端离线时被 B 端结束 → A 端联网后补结算
```
1. A 端飞行模式 + 23:00 入睡 → write sleepStateShared
2. B 端 07:00 起床 → write sleepStateShared
3. A 端关闭飞行模式 → App 启动 → initSleepSettings
4. 读取 doc.sleepStateShared → applySleepStateFromCloud(cloudState, 'init-shared')
5. 检测: cloudState.isSleeping (false) && wasSleeping (A 本地: true) && cloudUpdated > localUpdated
6. 触发 doSleepSettlement（与 watch 触发时同款逻辑）
7. 补结算完成
```

### 5.4 多端同时操作（last-write-wins）
```
1. A 端 23:00:00.123 写入 sleepStateShared.isSleeping = true
2. B 端 23:00:00.456 写入 sleepStateShared.isSleeping = true
3. 后写覆盖前写，最终 isSleeping = true（合理）
4. C 端 23:30:00.789 写入 isSleeping = false（起床）
5. A 和 B watch 触发 → applySleepStateFromCloud → 触发 doSleepSettlement
6. doSleepSettlement 内部有 isAutoSettling 锁（app-sleep.js 现有）+ date 去重 → 不会重复结算
```

---

## 6. 与任务系统的对称性验证

| 维度 | 任务系统 | v9.8.0 睡眠系统 | 一致 |
|------|----------|-----------------|------|
| 存储位置 | `tb_running` 表（per-user 共享） | `tb_profile.sleepStateShared` 字段（per-user 共享） | ✅ |
| 安全规则 | `doc._openid == auth.openid` | `doc._openid == auth.openid`（同文档） | ✅ |
| 写入时附 clientId | ✅ | ✅ | ✅ |
| watch 防本机回环 | ✅ | ✅ | ✅ |
| 任一端可开始 | ✅ | ✅ | ✅ |
| 任一端可结束 | ✅ | ✅ | ✅ |
| 跨设备实时同步 | ✅ | ✅ | ✅ |
| 离网补结算 | 无需（A 端 watch 触发） | ✅（initSleepSettings 走同款逻辑） | ✅ |
| UI 是否区分"其他设备" | ❌ | ❌ | ✅ |

---

## 7. 安全性

| 风险 | 缓解 |
|------|------|
| 任意用户修改他人 sleepStateShared | 已有 `tb_profile` 安全规则：只有本人能写（`doc._openid == auth.openid`） |
| 多端同时写入冲突 | last-write-wins（毫秒级时间戳） |
| clientId 伪造 | clientId 由 localStorage 生成 + 首次安装时绑定，安全等级同任务系统 |
| 远程修改导致 A 端误结算 | doSleepSettlement 内部去重 + isAutoSettling 锁 |

---

## 8. 测试策略

### 8.1 单元（手动）
- 默认值加载：清除 localStorage + Android 原生，刷新页面，确认显示 23:00 / 8:00 / 8h15m
- 升级迁移：手动在 tb_profile 写入 `deviceSleepState[deviceA]={lastUpdated: 1000, isSleeping: false}`，刷新后确认 `sleepStateShared` 被自动创建

### 8.2 集成（双设备）
- A 端 23:00 入睡 → B 端 sleepState.isSleeping 变 true → B 端睡眠卡片显示"睡眠中"
- B 端点击"起床" → A 端 sleepState.isSleeping 变 false → 触发 doSleepSettlement
- A 端无网络 → B 端起床 → A 端联网 → initSleepSettings 自动补结算
- 升级场景：手动把老用户的 tb_profile 中 `deviceSleepState` 数据迁移

### 8.3 回归
- 单设备用户无影响
- 老版本用户升级：per-device 数据自动迁移到 shared
- 任务系统正常运行

---

## 9. 不在本次设计内

- 零 UI 改动
- 不实现 sleepHistory 跨设备合并
- 不修改 Android Java 层
- 不引入新云函数

---

> 📌 **下一阶段**：等待用户确认后进入 [tasks.md](./tasks.md)
