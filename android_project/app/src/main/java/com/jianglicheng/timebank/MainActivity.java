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
        floatingTimerReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getStringExtra("action");
                String taskName = intent.getStringExtra("taskName");
                long elapsedTime = intent.getLongExtra("elapsedTime", 0); // [v7.18.3-fix3] 接收计时值
                android.util.Log.d("TimeBank", "[MainActivity] Received broadcast: action=" + action + ", task=" + taskName + ", elapsed=" + elapsedTime);
                if (action != null && taskName != null) {
                    // 通过 WebView 调用前端函数，传递计时值
                    String jsCode = "window.__onFloatingTimerAction && window.__onFloatingTimerAction('" 
                                  + action + "', '" + taskName.replace("'", "\\'") + "', " + elapsedTime + ");";
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
     * [v7.18.3-fix3] 检查并处理待处理的悬浮窗暂停/恢复操作，支持时间同步
     */
    private void checkPendingFloatingTimerAction() {
        try {
            SharedPreferences prefs = getSharedPreferences("floating_timer_state", MODE_PRIVATE);
            String action = prefs.getString("pendingAction", null);
            String taskName = prefs.getString("pendingTaskName", null);
            long timestamp = prefs.getLong("pendingTimestamp", 0);
            long elapsedTime = prefs.getLong("pendingElapsedTime", 0); // [v7.18.3-fix3] 读取计时值
            
            // 检查是否有待处理的操作且在 60 秒内
            if (action != null && taskName != null && (System.currentTimeMillis() - timestamp) < 60000) {
                android.util.Log.d("TimeBank", "[MainActivity] Found pending action in onResume: " + action + " for " + taskName + ", elapsed=" + elapsedTime);
                
                // 延迟 500ms 等待 WebView 准备好
                myWebView.postDelayed(() -> {
                    String jsCode = "window.__onFloatingTimerAction && window.__onFloatingTimerAction('" 
                                  + action + "', '" + taskName.replace("'", "\\'") + "', " + elapsedTime + ");";
                    myWebView.evaluateJavascript(jsCode, result -> {
                        android.util.Log.d("TimeBank", "[MainActivity] JS result from onResume: " + result);
                    });
                }, 500);
                
                // 清除已处理的操作
                prefs.edit().clear().apply();
            }
        } catch (Exception e) {
            android.util.Log.e("TimeBank", "[MainActivity] checkPendingFloatingTimerAction error", e);
        }
    }

    @Override
    public void onBackPressed() {
        if (myWebView.canGoBack()) {
            myWebView.goBack();
        } else {
            super.onBackPressed();
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