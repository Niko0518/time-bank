# v9.2.3 Checklist

## Phase 1: SPEC 完整性

- [x] spec.md 存在且包含 Why / What Changes / Impact / ADDED Requirements / MODIFIED Requirements
- [x] tasks.md 存在且任务可勾选
- [x] checklist.md 存在（本文件）

## Phase 2: P0 修复

- [ ] **2.1.1** [app-1.js:2385-2431](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2385) `DAL.init()` 增加 `checkProfileExists` 重试（200ms / 600ms 退避，3 次）+ `hasAnyData` 兜底
- [ ] **2.1.2** [app-1.js:6302-6359](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6302) `handlePostLoginDataInit` 移除 `if (hasData)` gate，始终走 `loadAll + subscribeAll + updateAllUI + startActiveSync`
- [ ] **2.1.3** [app-1.js:6290-6300](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6290) `ensureEmptyProfileForNewUser` 创建前先 `DAL.loadProfile()` 检查重复

## Phase 3: 防御性修复

- [ ] **3.1.1** 两端代码同步（`android_project/.../www/` ↔ 根 `js/`、`index.html`、`sw.js`）

## Phase 4: 版本号同步

- [ ] **4.1** [app-1.js:9](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L9) `APP_VERSION = 'v9.2.3'`
- [ ] **4.2** [app-1.js:8](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L8) 启动日志注释追加 v9.2.3
- [ ] **4.3** [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>` v9.2.3
- [ ] **4.4** [index.html:242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle` "TimeBank v9.2.3 · ..."
- [ ] **4.5** [index.html:1414](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1414) 关于页 v9.2.3
- [ ] **4.6** [index.html:1487](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1487) 用户日志 v9.2.3 条目
- [ ] **4.7** [sw.js:1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 注释 v9.2.3
- [ ] **4.8** [sw.js:7](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L7) CACHE_NAME v9.2.3
- [ ] **4.9** [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15) versionCode 48, versionName 9.2.3

## Phase 5: 验证（人工真机复测）

- [ ] **5.1** 安卓端冷启动后任务/交易列表立即显示（无空白态）
- [ ] **5.2** 关闭重开场景不再有"已登录+已同步"但无数据
- [ ] **5.3** "已同步" 状态在 `loadAll` 完成后才显示
- [ ] **5.4** Watch 监听状态保持 🟢

## 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| `DAL.init()` 重试延长冷启动时间 | 极低 | 退避 200/600ms + 首次重试 200ms（仅 2 次额外重试） |
| 移除 `if (hasData)` 后 `loadAll` 必定运行 | 低 | `loadAll` 内部已有 try/catch，且对真新用户会拉空数据（符合预期） |
| `ensureEmptyProfileForNewUser` 多一次 loadProfile 调用 | 极低 | 冷启动场景下增量可忽略 |
