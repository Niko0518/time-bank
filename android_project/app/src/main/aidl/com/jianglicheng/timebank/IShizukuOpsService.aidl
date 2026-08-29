// [v9.36.3] Shizuku UserService 授权服务接口
// 运行于 Shizuku 派生的独立进程（shell/root 身份，无 hidden API 限制），负责授予特殊权限（AppOps）。
// 授予方式：在 shell/root 身份进程内执行 `cmd appops set <pkg> <op> allow`（最稳、跨版本兼容）。
package com.jianglicheng.timebank;

interface IShizukuOpsService {
    // 对指定包授予一组 AppOps 特殊权限（opNames 如 GET_USAGE_STATS / SYSTEM_ALERT_WINDOW / SCHEDULE_EXACT_ALARM / POST_NOTIFICATION）
    // 返回逐项是否成功，供上层把失败项降级到普通引导。
    boolean[] grantOps(String packageName, in String[] opNames) = 1;

    // Shizuku 规定的销毁方法（事务码 16777114）：服务被替换/停止时调用，用于清理并退出进程。
    void destroy() = 16777114;
}