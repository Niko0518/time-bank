# v9.2.3 Tasks

## 任务清单

### T1: 创建 v9.2.3 spec 目录结构
- 创建 `.trae/specs/v9-2-3-first-launch-no-data-fix/` 目录
- 写入 `spec.md`、`checklist.md`、`tasks.md`

### T2: 修改 android 主线 `app-1.js`
- 2.1.1 重构 `DAL.init()` (line 2385-2431)
- 2.1.2 重构 `handlePostLoginDataInit` (line 6302-6359)
- 2.1.3 防御性修改 `ensureEmptyProfileForNewUser` (line 6290-6300)
- 4.1-4.2 版本号 + 日志 (line 8-9)

### T3: 修改 android 主线 `index.html`
- 4.3 title (line 12)
- 4.4 subtitle (line 242)
- 4.5 关于页 (line 1414)
- 4.6 用户日志条目 (新增在 1487 之后)

### T4: 修改 android 主线 `sw.js`
- 4.7 注释 (line 1)
- 4.8 CACHE_NAME (line 7)

### T5: 修改 `build.gradle`
- 4.9 versionCode 48, versionName 9.2.3 (line 15-16)

### T6: 同步根目录（`js/`、`index.html`、`sw.js`）
- 复制 `android_project/.../www/` 下改动到根目录对应文件
- 或直接编辑保持一致

### T7: 更新 debug session 状态
- 修改 `debug-android-first-launch-no-data.md` 标记实施完成

## 实施顺序

1. T1 (创建 spec 目录)
2. T2 (核心代码修复 + 版本号)
3. T3-T5 (其他文件版本号同步)
4. T6 (根目录同步)
5. T7 (debug 状态更新)
