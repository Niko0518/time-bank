# Checklist

- [x] 7 个位置的版本号全部更新为 `8.2.15`
- [x] DAL.startTask 在 UPDATE 失败时回退为 ADD，runningCache 正确更新
- [x] DAL.updateRunningTask 在文档不存在时清理 runningCache 和 runningTasks
- [x] tb_running 文档写入时携带 `lastUpdatedAt` 时间戳
- [x] DAL.loadAll 对跨设备 running 记录执行保留本地策略
- [x] Watch remove 事件同步清理 runningCache
- [x] applyDataState 默认分支不再无条件覆盖跨设备 runningTasks
- [x] 所有新增/修改日志包含 `[v8.2.15]` 标记便于排查
