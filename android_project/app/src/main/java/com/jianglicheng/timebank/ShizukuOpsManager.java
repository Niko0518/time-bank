// [v9.36.3] Shizuku 授权管理器（App 进程）
// 职责：
//  1. 探测 Shizuku Server 是否运行（无线调试每次重启失效 → 前端据此决定"极速授权 or 普通引导"）
//  2. 检查/申请 Shizuku 对本应用的使用授权（一次性）
//  3. 绑定 UserService（ShizukuOpsService，跑在 shell/root 身份进程），在其中执行 appops 授权
// 所有失败路径一律回调 null / boolean[]，由前端把失败项降级为现有普通引导，绝不阻断流程。
package com.jianglicheng.timebank;

import android.content.ComponentName;
import android.content.Context;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import rikka.shizuku.Shizuku;

public class ShizukuOpsManager {

    private static final String TAG = "TimeBank:ShizukuMgr";

    /** Shizuku 使用授权请求码（随意选一个） */
    private static final int PERMISSION_CODE = 10086;

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    // 绑定到的 UserService 代理（volatile 保证跨线程可见）
    private static volatile IShizukuOpsService sService;

    private static final Object BIND_LOCK = new Object();

    public interface OnResult {
        /** results 为 null 表示 Shizuku 不可用/授权失败；否则为逐项成功标志 */
        void onResult(boolean[] results);
    }

    /** Shizuku Server 是否在运行（无线调试能否访问）。异常一律按 false 处理（降级）。 */
    public static boolean isShizukuRunning() {
        try {
            return Shizuku.pingBinder();
        } catch (Throwable t) {
            return false;
        }
    }

    /** 本应用是否已获得 Shizuku 使用授权 */
    public static boolean isPermissionGranted() {
        try {
            return Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable t) {
            return false;
        }
    }

    /**
     * 发起 Shizuku 使用授权申请。返回 true 表示已拥有授权；false 表示已发起申请（或版本不支持）。
     * 授权为一次性操作；用户允许后再次调用极速授权即可真正下发 appops。
     */
    public static boolean ensurePermission() {
        if (isPermissionGranted()) return true;
        try {
            if (Shizuku.isPreV11()) return false;
            Shizuku.requestPermission(PERMISSION_CODE);
        } catch (Throwable t) {
            Log.w(TAG, "requestPermission failed, degrade to normal", t);
        }
        return false;
    }

    /**
     * 在后台线程对所有 opNames 执行极速授权。结果（逐项 true/false 或 null）回调到主线程。
     * 调用方可立即返回，无需等待。
     */
    public static void grantOps(final Context context, final String[] opNames, final OnResult callback) {
        if (opNames == null || opNames.length == 0) {
            postResult(callback, new boolean[0]);
            return;
        }
        if (!isShizukuRunning() || !isPermissionGranted()) {
            postResult(callback, null);
            return;
        }
        new Thread(() -> {
            IShizukuOpsService svc = waitForService(context);
            boolean[] results = null;
            if (svc != null) {
                try {
                    results = svc.grantOps(context.getPackageName(), opNames);
                } catch (Throwable t) {
                    Log.w(TAG, "grantOps error, degrade", t);
                }
            }
            postResult(callback, results);
        }, "TimeBankShizukuGrant").start();
    }

    /** 保证 bound 完成后返回可用代理；绑定失败返回 null（最多等待 5s）。 */
    private static IShizukuOpsService waitForService(final Context context) {
        IShizukuOpsService svc = sService;
        if (svc != null) return svc;

        synchronized (BIND_LOCK) {
            // 在主线程发起绑定（bindUserService 依赖有 Looper 的线程注册连接回执）
            MAIN.post(() -> bind(context));

            long deadline = SystemClock.elapsedRealtime() + 5000;
            while (sService == null && SystemClock.elapsedRealtime() < deadline) {
                try {
                    Thread.sleep(20);
                } catch (InterruptedException ignored) {
                    break;
                }
            }
            return sService;
        }
    }

    /** 发起一次 UserService 绑定（幂等：已绑定则跳过）。绑定时 sService 为 null。 */
    private static void bind(Context context) {
        if (sService != null) {
            return;
        }
        try {
            Shizuku.UserServiceArgs args =
                    new Shizuku.UserServiceArgs(new ComponentName(context, ShizukuOpsService.class))
                            .tag("timebank-ops")
                            .processNameSuffix("timebank_ops")
                            .debuggable(true)
                            .version(1);
            Shizuku.bindUserService(args, sConnection);
        } catch (Throwable t) {
            Log.w(TAG, "bindUserService failed, degrade", t);
            sService = null;
        }
    }

    private static void postResult(final OnResult callback, final boolean[] results) {
        if (callback == null) return;
        MAIN.post(() -> {
            try {
                callback.onResult(results);
            } catch (Throwable ignored) {
            }
        });
    }

    private static final ServiceConnection sConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            Log.d(TAG, "user service connected: " + name);
            sService = IShizukuOpsService.Stub.asInterface(service);
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            Log.w(TAG, "user service disconnected");
            sService = null;
        }
    };
}