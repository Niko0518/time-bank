# Tasks

- [x] Task 1: 版本号更新至 v8.2.15（7 个位置）
  - [x] 1.1 更新 `js/app-1.js`: `APP_VERSION` = `"8.2.15"`
  - [x] 1.2 更新 `index.html`: `<title>` 标签
  - [x] 1.3 更新 `index.html`: `.version-subtitle`
  - [x] 1.4 更新 `index.html`: 关于页版本号
  - [x] 1.5 更新 `sw.js`: 文件头部注释
  - [x] 1.6 更新 `sw.js`: `CACHE_NAME` = `timebank-cache-v8.2.15`
  - [x] 1.7 更新 `android_project/app/build.gradle`: `versionName` = `"8.2.15"`

- [x] Task 2: tb_running 文档增加 lastUpdatedAt 时间戳
  - [x] 2.1 修改 `DAL.startTask` 的 `runningData`，增加 `lastUpdatedAt: Date.now()`
  - [x] 2.2 修改 `DAL.updateRunningTask`，UPDATE 时也更新 `lastUpdatedAt`

- [x] Task 3: DAL.startTask 增加 UPDATE 失败回退为 ADD
  - [x] 3.1 修改 `DAL.startTask`，在 UPDATE 的 catch 中增加 ADD 回退
  - [x] 3.2 ADD 成功后更新 `runningCache` 为新文档 ID
  - [x] 3.3 确保回退时携带完整的 runningData（含 `lastUpdatedAt`）

- [x] Task 4: DAL.updateRunningTask 增加文档存在性守卫
  - [x] 4.1 修改 `DAL.updateRunningTask`，在 UPDATE 的 catch 中检测是否因文档不存在而失败
  - [x] 4.2 文档不存在时清理 `runningCache.delete(taskId)` 和 `runningTasks.delete(taskId)`
  - [x] 4.3 添加明确的日志输出 `[v8.2.15]` 标记用于排查

- [x] Task 5: Watch remove 事件同步清理 runningCache
  - [x] 5.1 修改 `DAL.subscribeAll` 中 tb_running Watch 的 remove 处理
  - [x] 5.2 在 `remoteClientId !== clientId` 路径下，增加 `this.runningCache.delete(taskId)`
  - [x] 5.3 确认现有 `runningTasks.delete(taskId)` 逻辑不变

- [x] Task 6: DAL.loadAll 增加跨设备 running 保护
  - [x] 6.1 在 `DAL.loadAll` 的 runningTasks 应用逻辑中，对 `clientId !== thisClientId` 的云端记录执行保留本地策略
  - [x] 6.2 本地有而云端无的记录（被其他设备删除），保留本地版本
  - [x] 6.3 本地无而云端有的记录（其他设备新开），接受云端
  - [x] 6.4 所有新增日志标记 `[v8.2.15]`

- [x] Task 7: applyDataState 增加跨设备保护
  - [x] 7.1 修改 `applyDataState` 中 runningTasks 默认分支（信任云端），增加 `clientId` 检查
  - [x] 7.2 对于云端记录 `clientId !== thisClientId` 且本地也有同 taskId 的，保留本地
  - [x] 7.3 所有新增日志标记 `[v8.2.15]`

# Task Dependencies
- Task 1（版本号）无依赖，可立即执行
- Task 2（lastUpdatedAt）无依赖，可立即执行
- Task 3 依赖 Task 2（需要 lastUpdatedAt 字段）
- Task 4 依赖 Task 2（需要 lastUpdatedAt 字段）
- Task 5 独立，可与其他任务并行
- Task 6 独立，可与其他任务并行
- Task 7 独立，可与其他任务并行
