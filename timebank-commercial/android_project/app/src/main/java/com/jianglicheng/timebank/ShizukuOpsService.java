// [v9.36.3] Shizuku 授权服务实现（UserService 进程）
// 以 Shizuku（shell uid 2000 / root uid 0）身份运行。授予 AppOps 特殊权限的方式：
// 在权限进程内执行 `cmd appops set <pkg> <op> allow`（官方 appops 命令，跨版本最稳，
// 无需反射 hidden API，也不用关心 AppOps op 数值在不同版本的变化）。
// 任一 op 失败单独标记 false，交由上层把该项降级到普通权限引导，绝不阻断流程。
package com.jianglicheng.timebank;

import android.content.Context;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class ShizukuOpsService extends IShizukuOpsService.Stub {

    private static final String TAG = "TimeBank:ShizukuSvc";

    public ShizukuOpsService() {
        super();
    }

    // Shizuku v13 优先调用带 Context 的构造器；旧版本回退到无参构造器。
    // 说明：UserService 进程不是合法的应用进程，Context 能力有限（不能 registerReceiver/getContentResolver），
    // 但这里只用来拿 packageName，足够。
    public ShizukuOpsService(Context context) {
        super();
    }

    @Override
    public boolean[] grantOps(String packageName, String[] opNames) {
        if (packageName == null || opNames == null || opNames.length == 0) {
            return new boolean[0];
        }
        boolean[] result = new boolean[opNames.length];
        for (int i = 0; i < opNames.length; i++) {
            result[i] = execAppopsAllow(packageName, opNames[i]);
        }
        return result;
    }

    /** 执行 `cmd appops set <pkg> <op> allow`，返回是否成功 */
    private boolean execAppopsAllow(String packageName, String opName) {
        if (opName == null || opName.isEmpty()) return false;
        try {
            Process process = Runtime.getRuntime().exec(new String[]{
                    "cmd", "appops", "set", packageName, opName.trim(), "allow"
            });
            String out = readAll(process.getInputStream());
            String err = readAll(process.getErrorStream());
            int code = process.waitFor();
            if (code == 0) {
                Log.d(TAG, "grant ok: " + opName);
                return true;
            }
            Log.w(TAG, "grant failed(" + code + ") op=" + opName + " out=" + out + " err=" + err);
            return false;
        } catch (Throwable t) {
            Log.w(TAG, "grant exception op=" + opName, t);
            return false;
        }
    }

    private static String readAll(InputStream is) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[256];
        int n;
        try {
            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
        } finally {
            try { is.close(); } catch (Exception ignore) {}
        }
        return new String(bos.toByteArray(), StandardCharsets.UTF_8);
    }

    @Override
    public void destroy() {
        Log.d(TAG, "destroy user service process");
        System.exit(0);
    }
}