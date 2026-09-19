package com.jianglicheng.timebank;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * TimeBank AI 服务管理器
 * [v8.0.0-cloud] 改为云端 AI 方案，通过 CloudBase 云函数调用
 *
 * 之前是本地 MediaPipe 方案，现在改为：
 *   前端 JS → CloudBase 云函数 (timebankAI) → Gemini/混元/OpenAI
 *
 * 本类现在主要职责：
 *   1. 提供 AI 服务状态查询（供前端轮询）
 *   2. 透传前端数据到 JS 回调
 *   3. 保持与旧版接口兼容
 */
public class TimeBankLLM {
    private static final String TAG = "TimeBankLLM";

    // 云端 AI 状态（由前端通过云函数查询后设置）
    private volatile boolean llmAvailable = false;
    private volatile String statusMessage = "等待初始化...";
    private volatile String loadError = null;

    // 缓存
    private String lastReport;
    private long lastReportTime;
    private static final long REPORT_CACHE_TTL = 3600000;

    private static TimeBankLLM instance;
    private Context context;

    private TimeBankLLM(Context context) {
        this.context = context.getApplicationContext();
        Log.d(TAG, "TimeBankLLM initialized (cloud mode)");
    }

    public static synchronized TimeBankLLM getInstance(Context context) {
        if (instance == null) {
            instance = new TimeBankLLM(context);
        }
        return instance;
    }

    /**
     * [v8.0.0-cloud] 初始化改为空操作
     * 实际初始化由前端通过云函数完成
     */
    public void initModelAsync() {
        Log.d(TAG, "initModelAsync called (cloud mode - no local model to load)");
        // 云端方案无需本地加载，前端会直接查询云函数状态
        statusMessage = "AI 服务就绪（云端）";
    }

    // ========== 状态接口（供前端轮询）==========

    /**
     * [v8.0.0-cloud] 是否可用由前端通过云函数查询后设置
     */
    public boolean isAvailable() {
        return llmAvailable;
    }

    public void setAvailable(boolean available) {
        this.llmAvailable = available;
        this.statusMessage = available ? "AI 服务可用" : "AI 服务暂不可用";
    }

    /**
     * [v8.0.0-cloud] 云端方案始终返回 true（不需要下载模型文件）
     */
    public boolean isModelDownloaded() {
        return true;
    }

    /**
     * [v8.0.0-cloud] 云端方案没有本地加载过程
     */
    public boolean isLoading() {
        return false;
    }

    public String getStatusMessage() {
        return statusMessage;
    }

    public void setStatusMessage(String message) {
        this.statusMessage = message;
    }

    public String getLoadError() {
        return loadError;
    }

    public void setLoadError(String error) {
        this.loadError = error;
    }

    // ========== 报告生成（透传给前端回调）==========

    /**
     * [v8.0.0-cloud] 报告生成由前端通过云函数完成
     * 本方法仅作为透传层，保持接口兼容
     */
    public void generateInsightReport(String userData, LLMCallback callback) {
        // 云端方案：前端直接调用云函数，不经过此处
        // 保留此方法是为了保持与旧代码的兼容性
        Log.w(TAG, "generateInsightReport called in cloud mode - should be handled by frontend");
        callback.onError(new Exception("请使用前端云函数调用"));
    }

    // ========== 聊天功能（透传给前端回调）==========

    /**
     * [v8.0.0-cloud] 聊天由前端通过云函数完成
     */
    public void chat(String message, LLMCallback callback) {
        Log.w(TAG, "chat called in cloud mode - should be handled by frontend");
        callback.onError(new Exception("请使用前端云函数调用"));
    }

    // ========== 回调接口 ==========

    public interface LLMCallback {
        void onResult(String result);
        void onError(Exception e);
    }
}
