package com.jianglicheng.timebank;

import android.Manifest;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Base64;

public class MainActivity extends AppCompatActivity {

    private WebView myWebView;
    private ValueCallback<Uri[]> mUploadMessage;
    public static final int FILECHOOSER_RESULTCODE = 1;
    private WebViewAssetLoader assetLoader;
    // [v7.18.3] 悬浮窗事件接收器
    private BroadcastReceiver floatingTimerReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. 动态申请通知权限 (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        // 2. 申请闹钟权限 (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            android.app.AlarmManager alarmManager = (android.app.AlarmManager) getSystemService(ALARM_SERVICE);
            if (!alarmManager.canScheduleExactAlarms()) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                startActivity(intent);
            }
        }

        // [v7.36.2] 启动应用保活服务
        KeepAliveService.startService(this);

        myWebView = new WebView(this);
        setContentView(myWebView);


        WebSettings webSettings = myWebView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        
        // [v7.3.4] 设置 WebView 数据持久化路径，防止重启后登录状态丢失
        String databasePath = getApplicationContext().getDir("webviewdb", MODE_PRIVATE).getPath();
        webSettings.setDatabasePath(databasePath);
        // 设置缓存模式为优先使用缓存
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // 3. 暗色模式适配：强制 WebView 跟随系统
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int nightModeFlags = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
            if (nightModeFlags == Configuration.UI_MODE_NIGHT_YES) {
                webSettings.setForceDark(WebSettings.FORCE_DARK_ON);
            } else {
                webSettings.setForceDark(WebSettings.FORCE_DARK_OFF);
            }
        }

        // 4. 注入 JS 接口
        myWebView.addJavascriptInterface(new WebAppInterface(this), "Android");

        // [v8.0.0] 预加载 AI 大模型（异步，不阻塞 UI）
        new Thread(() -> {
            TimeBankLLM llm = TimeBankLLM.getInstance(this);
            llm.initModelAsync();
        }).start();

        // [v7.9.9] 监听系统导航栏高度变化（适配三键导航栏）
        ViewCompat.setOnApplyWindowInsetsListener(myWebView, (v, insets) -> {
            Insets navInsets = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            int bottom = navInsets != null ? navInsets.bottom : 0;
            myWebView.post(() -> myWebView.evaluateJavascript(
                "window.__setAndroidNavBarHeight && window.__setAndroidNavBarHeight(" + bottom + ");",
                null
            ));
            return insets;
        });
        ViewCompat.requestApplyInsets(myWebView);

        // 5. 使用 WebViewAssetLoader 将本地资源映射到虚拟 HTTPS 域名
        // 这样 CloudBase SDK 才能正确识别域名
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("timebank.local")  // 虚拟域名
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        myWebView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        // 5. 文件选择支持 (导入/导出数据)
        myWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (mUploadMessage != null) {
                    mUploadMessage.onReceiveValue(null);
                }
                mUploadMessage = filePathCallback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                startActivityForResult(Intent.createChooser(intent, "选择备份文件"), FILECHOOSER_RESULTCODE);
                return true;
            }
        });

        // 6. 下载支持 (处理 blob: URL 和普通下载)
        myWebView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                if (url.startsWith("blob:")) {
                    // blob URL 需要通过 JS 获取内容
                    myWebView.evaluateJavascript(
                        "(function() {" +
                        "  var xhr = new XMLHttpRequest();" +
                        "  xhr.open('GET', '" + url + "', true);" +
                        "  xhr.responseType = 'blob';" +
                        "  xhr.onload = function() {" +
                        "    var reader = new FileReader();" +
                        "    reader.onloadend = function() {" +
                        "      Android.saveFile(reader.result, '" + URLUtil.guessFileName(url, contentDisposition, mimetype) + "');" +
                        "    };" +
                        "    reader.readAsDataURL(xhr.response);" +
                        "  };" +
                        "  xhr.send();" +
                        "})();", null);
                } else {
                    // 普通 URL 使用系统下载管理器
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.setMimeType(mimetype);
                    request.addRequestHeader("User-Agent", userAgent);
                    request.setDescription("正在下载文件...");
                    request.setTitle(URLUtil.guessFileName(url, contentDisposition, mimetype));
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, contentDisposition, mimetype));
                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    dm.enqueue(request);
                    Toast.makeText(getApplicationContext(), "文件开始下载...", Toast.LENGTH_SHORT).show();
                }
            }
        });

        // 加载网页 - 使用虚拟 HTTPS 域名
        myWebView.loadUrl("https://timebank.local/assets/www/index.html");

        // [v7.18.3-fix3] 注册悬浮窗事件接收器，支持时间同步
        // [v9.3.1] 携带 eventId，JS 处理后回传 ack
        floatingTimerReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getStringExtra("action");
                String taskName = intent.getStringExtra("taskName");
                long elapsedTime = intent.getLongExtra("elapsedTime", 0); // [v7.18.3-fix3] 接收计时值
                String eventId = intent.getStringExtra("eventId"); // [v9.3.1]
                android.util.Log.d("TimeBank", "[MainActivity] Received broadcast: action=" + action + ", task=" + taskName + ", elapsed=" + elapsedTime + ", eventId=" + eventId);
                if (action != null && taskName != null) {
                    // 通过 WebView 调用前端函数，传递计时值和 eventId
                    String safeTaskName = taskName.replace("'", "\\'");
                    String jsCode = "window.__onFloatingTimerAction && window.__onFloatingTimerAction('" 
                                  + action + "', '" + safeTaskName + "', " + elapsedTime + ", '" 
                                  + (eventId == null ? "" : eventId) + "');";
                    android.util.Log.d("TimeBank", "[MainActivity] Executing JS: " + jsCode);
                    myWebView.post(() -> myWebView.evaluateJavascript(jsCode, result -> {
                        android.util.Log.d("TimeBank", "[MainActivity] JS result: " + result);
                    }));
                }
            }
        };
        // [v7.18.3] 注册接收器，兼容各 Android 版本
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(floatingTimerReceiver, 
                new IntentFilter("com.jianglicheng.timebank.FLOATING_TIMER_ACTION"),
                Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(floatingTimerReceiver, 
                new IntentFilter("com.jianglicheng.timebank.FLOATING_TIMER_ACTION"));
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // [v7.18.3] 注销悬浮窗事件接收器
        if (floatingTimerReceiver != null) {
            unregisterReceiver(floatingTimerReceiver);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // [v7.18.3] 应用回到前台时，检查是否有待处理的悬浮窗操作
        checkPendingFloatingTimerAction();
        // [v7.20.2-fix] 前台兜底同步系统深浅色状态，提升“跟随系统”稳定性
        notifyJsSystemThemeChanged();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // [v7.20.2-fix] Activity 接管 uiMode 后不会重建，这里手动同步 WebView 与前端主题
        syncWebViewForceDark(newConfig);
        notifyJsSystemThemeChanged();
    }

    private void syncWebViewForceDark(Configuration config) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && myWebView != null) {
            int nightModeFlags = config.uiMode & Configuration.UI_MODE_NIGHT_MASK;
            WebSettings settings = myWebView.getSettings();
            settings.setForceDark(
                nightModeFlags == Configuration.UI_MODE_NIGHT_YES
                    ? WebSettings.FORCE_DARK_ON
                    : WebSettings.FORCE_DARK_OFF
            );
        }
    }

    private void notifyJsSystemThemeChanged() {
        if (myWebView == null) return;
        int nightModeFlags = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        boolean isDark = nightModeFlags == Configuration.UI_MODE_NIGHT_YES;
        String jsCode = "window.__onAndroidUiModeChanged && window.__onAndroidUiModeChanged(" + isDark + ");";
        myWebView.post(() -> myWebView.evaluateJavascript(jsCode, null));
    }

    /**
     * [v9.3.1] 检查并处理待处理的悬浮窗暂停/恢复操作
     * 重大改造：旧的"60 秒窗口 + 固定 500ms 延迟"在 WebView 重建时序下极易丢失。
     * 新流程：
     *   1. 先读旧"floating_timer_state"通道（兼容老版本）
     *   2. 再读新"floating_timer_events"持久事件队列（TTL 30 分钟）
     *   3. JS 端通过 ack 机制确认已处理后，原生层才清理事件
     *   4. 失败时通过 scheduleRetry 重试，最多 15 次（3 秒）
     */
    private void checkPendingFloatingTimerAction() {
        try {
            // 1. 处理旧通道（兼容）
            SharedPreferences prefs = getSharedPreferences("floating_timer_state", MODE_PRIVATE);
            String action = prefs.getString("pendingAction", null);
            String taskName = prefs.getString("pendingTaskName", null);
            long timestamp = prefs.getLong("pendingTimestamp", 0);
            long elapsedTime = prefs.getLong("pendingElapsedTime", 0);
            
            if (action != null && taskName != null && (System.currentTimeMillis() - timestamp) < 60000) {
                android.util.Log.d("TimeBank", "[MainActivity] Found legacy pending action: " + action + " for " + taskName);
                String safeTaskName = taskName.replace("'", "\\'");
                String jsCode = "window.__onFloatingTimerAction && window.__onFloatingTimerAction('" 
                              + action + "', '" + safeTaskName + "', " + elapsedTime + ", '');";
                scheduleRetry(jsCode, 0);
                prefs.edit().clear().apply();
            }
            
            // 2. 处理新通道（持久事件队列）
            SharedPreferences eventPrefs = getSharedPreferences("floating_timer_events", MODE_PRIVATE);
            long now = System.currentTimeMillis();
            int eventCount = 0;
            for (String key : eventPrefs.getAll().keySet()) {
                if (!key.endsWith("_action")) continue;
                long ts = eventPrefs.getLong(key.replace("_action", "_ts"), 0);
                if (now - ts > 30 * 60 * 1000L) continue; // 30 分钟 TTL
                
                String eventId = key.replace("_action", "");
                String evtAction = eventPrefs.getString(key, "");
                String evtTaskName = eventPrefs.getString(eventId + "_taskName", "");
                long evtElapsed = eventPrefs.getLong(eventId + "_elapsed", 0);
                
                if (evtAction.isEmpty() || evtTaskName.isEmpty()) continue;
                
                android.util.Log.d("TimeBank", "[MainActivity] Found persistent event: " + evtAction + " for " + evtTaskName + " (eventId=" + eventId + ")");
                String safeTaskName = evtTaskName.replace("'", "\\'");
                String jsCode = "window.__onFloatingTimerAction && window.__onFloatingTimerAction('" 
                              + evtAction + "', '" + safeTaskName + "', " + evtElapsed + ", '" + eventId + "');";
                scheduleRetry(jsCode, 0);
                eventCount++;
            }
            android.util.Log.d("TimeBank", "[MainActivity] Scheduled " + eventCount + " pending event(s) for retry");
        } catch (Exception e) {
            android.util.Log.e("TimeBank", "[MainActivity] checkPendingFloatingTimerAction error", e);
        }
    }

    /**
     * [v9.3.1] 可重试的 JS 调度：解决 500ms 固定延迟不够的问题
     * 最多重试 15 次（3 秒），每次间隔 200ms
     * 一旦 JS 端返回 true（表示已应用），停止重试
     *
     * [v9.3.2] Bug 1 修复：明确"ok"返回值的语义
     *   - "applied"：JS 端已成功应用事件（task 找到、action 执行完成、ack 已发）
     *   - "ok"：JS 端主动丢弃事件（v9.3.2 新增语义）
     *     • stopTask 静默期内：用户已主动停止任务，晚到的浮窗事件一律丢弃
     *     • 云端无记录：用户已停止任务，云端已删除文档，原生 Service 残留的 timer 不应复活
     *     • 原生 elapsed <= maxElapsed：原生 Service 持有的是"陈旧已暂停"状态
     *   - "waiting"：JS 端还在等待数据（tasks 未加载、runningTasks 未初始化等），需重试
     *   - 任何其他值（null / 错误 / 未知）：保守起见重试一次
     * 重要：仅 "waiting" / null / 空 / 异常 这 4 种情况继续重试；"applied" / "ok" / 任何其他值均停止重试
     */
    private void scheduleRetry(String jsCode, int attempt) {
        if (attempt >= 15) {
            android.util.Log.w("TimeBank", "[MainActivity] scheduleRetry: gave up after 15 attempts");
            return;
        }
        myWebView.postDelayed(() -> {
            if (myWebView == null) return;
            myWebView.evaluateJavascript(jsCode, result -> {
                android.util.Log.d("TimeBank", "[MainActivity] scheduleRetry attempt=" + attempt + " result=" + result);
                // [v9.3.1] 如果返回 "ready"，表示 JS 端 ready 但应用失败（需要排查）
                // 如果返回 "applied"，表示 JS 端已成功应用
                // 如果返回 "ok"，表示 JS 端主动丢弃（v9.3.2 Bug 1 修复：stopTask 静默期 / 云端无记录 / 原生陈旧）
                // 如果返回 "waiting"，表示 JS 端还在等待数据
                // 仅 "waiting" 继续重试，其他情况停止
                boolean shouldRetry = (result == null || result.equals("null") || result.isEmpty() || result.equals("\"waiting\""));
                if (shouldRetry) {
                    scheduleRetry(jsCode, attempt + 1);
                } else if (result.equals("\"ok\"")) {
                    android.util.Log.d("TimeBank", "[MainActivity] scheduleRetry: JS dropped event (ok), stop retry");
                } else {
                    android.util.Log.d("TimeBank", "[MainActivity] scheduleRetry: JS applied event, stop retry");
                }
            });
        }, 200);
    }

    @Override
    public void onBackPressed() {
        if (myWebView.canGoBack()) {
            myWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /**
     * [v8.0.0] 供 WebAppInterface 调用，执行 JavaScript 代码
     */
    public void evaluateJavascript(String jsCode) {
        if (myWebView != null) {
            myWebView.post(() -> myWebView.evaluateJavascript(jsCode, null));
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent intent) {
        super.onActivityResult(requestCode, resultCode, intent);
        if (requestCode == FILECHOOSER_RESULTCODE) {
            if (mUploadMessage == null) return;
            Uri[] results = null;
            if (resultCode == AppCompatActivity.RESULT_OK && intent != null) {
                String dataString = intent.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                }
            }
            mUploadMessage.onReceiveValue(results);
            mUploadMessage = null;
        }
    }
}