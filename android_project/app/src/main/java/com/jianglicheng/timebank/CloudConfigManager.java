package com.jianglicheng.timebank;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * [v9.17.9] 云端配置管理器
 *
 * 三层配置优先级（从高到低）：
 * 1. 运行时配置（可由外部调用 override() 注入，暂未启用）
 * 2. 环境配置文件（assets/config/config.{env}.json）
 *    env 来源：AndroidManifest meta-data "cloud_env" > 默认 production
 * 3. 默认配置（DEFAULT_CONFIG 字符串兜底）
 *
 * 设计目标：
 * - 消除 CloudBase envId / 云函数端点 / AI 端点等硬编码
 * - 加载失败时静默回退到默认配置（绝不阻塞主流程）
 * - 单例模式，避免重复解析
 *
 * 使用示例：
 *   String url = CloudConfigManager.getInstance(ctx).getEndpoint("sync");
 *   String envId = CloudConfigManager.getInstance(ctx).getCloudBaseEnvId();
 */
public class CloudConfigManager {
    private static final String TAG = "CloudConfigManager";

    /** AndroidManifest 中声明的环境变量 meta-data key */
    private static final String META_DATA_KEY_ENV = "cloud_env";

    /** 配置文件目录（位于 assets 下） */
    private static final String CONFIG_ASSET_DIR = "config/";

    /** 默认环境（兜底） */
    private static final String DEFAULT_ENV = "production";

    /**
     * 默认配置：与 assets/www/js/config-manager.js 中的 DEFAULT_CONFIG 保持一致
     * 当配置文件加载失败时使用此字符串兜底
     */
    private static final String DEFAULT_CONFIG_JSON =
        "{\"env\":\"production\"," +
        "\"cloudbase\":{\"envId\":\"cloud1-8gvjsmyd7860b4a3\",\"region\":\"ap-shanghai\"," +
        "\"functions\":{\"sync\":\"timebankSync\",\"ai\":\"timebankAI\"}}," +
        "\"endpoints\":{" +
        "\"sync\":\"https://cloud1-8gvjsmyd7860b4a3-1304758747.ap-shanghai.app.tcloudbase.com/timebankSync\"," +
        "\"ai\":\"https://cloud1-8gvjsmyd7860b4a3-1384910920.ap-shanghai.app.tcloudbase.com/timebankAI\"}," +
        "\"features\":{\"enableCloudSync\":true,\"enableAI\":true,\"enableWatch\":true}}";

    private static volatile CloudConfigManager instance;
    private final JsonObject config;
    private final String env;

    private CloudConfigManager(Context context) {
        Context appCtx = context.getApplicationContext();
        this.env = detectEnvironment(appCtx);
        JsonObject loaded = tryLoadEnvConfig(appCtx, this.env);
        this.config = loaded != null ? loaded : parseOrDefault(DEFAULT_CONFIG_JSON);
        if (loaded == null) {
            Log.w(TAG, "[v9.17.9] 使用默认配置（环境配置文件加载失败）");
        } else {
            Log.i(TAG, "[v9.17.9] 已加载环境配置: " + this.env);
        }
    }

    /**
     * 获取单例（线程安全）
     */
    public static CloudConfigManager getInstance(Context context) {
        if (instance == null) {
            synchronized (CloudConfigManager.class) {
                if (instance == null) {
                    instance = new CloudConfigManager(context);
                }
            }
        }
        return instance;
    }

    /**
     * 重置单例（测试 / 调试用，正常流程不要调用）
     */
    public static synchronized void resetInstance() {
        instance = null;
    }

    // ====================================================================
    // 公开 API
    // ====================================================================

    /**
     * 获取当前环境名（production / development / testing 等）
     */
    public String getEnv() {
        return env;
    }

    /**
     * 是否生产环境
     */
    public boolean isProduction() {
        return "production".equals(env);
    }

    /**
     * 获取 CloudBase 环境 ID
     */
    public String getCloudBaseEnvId() {
        try {
            JsonObject cb = config.getAsJsonObject("cloudbase");
            if (cb != null && cb.has("envId") && !cb.get("envId").isJsonNull()) {
                return cb.get("envId").getAsString();
            }
        } catch (Exception e) {
            Log.w(TAG, "getCloudBaseEnvId 异常，使用默认值", e);
        }
        return "cloud1-8gvjsmyd7860b4a3";
    }

    /**
     * 获取 CloudBase 区域（如 ap-shanghai）
     */
    public String getCloudBaseRegion() {
        try {
            JsonObject cb = config.getAsJsonObject("cloudbase");
            if (cb != null && cb.has("region") && !cb.get("region").isJsonNull()) {
                return cb.get("region").getAsString();
            }
        } catch (Exception e) {
            Log.w(TAG, "getCloudBaseRegion 异常，使用默认值", e);
        }
        return "ap-shanghai";
    }

    /**
     * 获取云函数 HTTP 端点
     * @param service "sync" 或 "ai"
     * @return 完整 URL；解析失败返回 null（调用方应自行兜底）
     */
    public String getEndpoint(String service) {
        if (service == null) return null;
        try {
            JsonObject endpoints = config.getAsJsonObject("endpoints");
            if (endpoints != null && endpoints.has(service) && !endpoints.get(service).isJsonNull()) {
                return endpoints.get(service).getAsString();
            }
        } catch (Exception e) {
            Log.w(TAG, "getEndpoint(" + service + ") 异常", e);
        }
        // 兜底
        if ("sync".equals(service)) {
            return "https://cloud1-8gvjsmyd7860b4a3-1304758747.ap-shanghai.app.tcloudbase.com/timebankSync";
        }
        if ("ai".equals(service)) {
            return "https://cloud1-8gvjsmyd7860b4a3-1384910920.ap-shanghai.app.tcloudbase.com/timebankAI";
        }
        return null;
    }

    /**
     * 获取云函数名（不含端点）
     */
    public String getFunctionName(String service) {
        if (service == null) return null;
        try {
            JsonObject cb = config.getAsJsonObject("cloudbase");
            if (cb != null) {
                JsonObject functions = cb.getAsJsonObject("functions");
                if (functions != null && functions.has(service) && !functions.get(service).isJsonNull()) {
                    return functions.get(service).getAsString();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "getFunctionName(" + service + ") 异常", e);
        }
        // 兜底
        if ("sync".equals(service)) return "timebankSync";
        if ("ai".equals(service)) return "timebankAI";
        return null;
    }

    /**
     * 获取 feature 开关
     */
    public boolean isFeatureEnabled(String name) {
        if (name == null) return false;
        try {
            JsonObject features = config.getAsJsonObject("features");
            if (features != null && features.has(name) && !features.get(name).isJsonNull()) {
                return features.get(name).getAsBoolean();
            }
        } catch (Exception e) {
            Log.w(TAG, "isFeatureEnabled(" + name + ") 异常", e);
        }
        // 兜底：默认全部启用
        return true;
    }

    /**
     * 获取完整配置 JSON 字符串（用于注入到 WebView 的 window._nativeConfig）
     */
    public String getConfigJson() {
        return config.toString();
    }

    // ====================================================================
    // 内部方法
    // ====================================================================

    /**
     * 从 AndroidManifest meta-data 读取环境名；找不到则返回默认
     */
    private String detectEnvironment(Context appCtx) {
        try {
            ApplicationInfo ai = appCtx.getPackageManager().getApplicationInfo(
                appCtx.getPackageName(), PackageManager.GET_META_DATA);
            if (ai != null && ai.metaData != null) {
                String envValue = ai.metaData.getString(META_DATA_KEY_ENV);
                if (envValue != null && !envValue.isEmpty()) {
                    String safe = envValue.replaceAll("[^a-zA-Z0-9_-]", "");
                    if (!safe.isEmpty()) {
                        return safe;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "读取 meta-data " + META_DATA_KEY_ENV + " 失败，使用默认环境", e);
        }
        return DEFAULT_ENV;
    }

    /**
     * 尝试从 assets 加载指定环境的配置文件
     * @return 成功返回 JsonObject，失败返回 null
     */
    private JsonObject tryLoadEnvConfig(Context appCtx, String envName) {
        if (envName == null || envName.isEmpty()) return null;
        String assetPath = CONFIG_ASSET_DIR + "config." + envName + ".json";
        try (InputStream is = appCtx.getAssets().open(assetPath);
             BufferedReader reader = new BufferedReader(
                 new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            JsonObject parsed = new Gson().fromJson(sb.toString(), JsonObject.class);
            if (parsed != null) {
                return parsed;
            }
        } catch (Exception e) {
            Log.w(TAG, "加载 " + assetPath + " 失败: " + e.getMessage());
        }
        return null;
    }

    private JsonObject parseOrDefault(String json) {
        try {
            JsonObject obj = new Gson().fromJson(json, JsonObject.class);
            if (obj != null) return obj;
        } catch (Exception e) {
            Log.e(TAG, "默认配置 JSON 解析失败（这不应该发生）", e);
        }
        // 极兜底：返回最小可用配置
        return new Gson().fromJson(DEFAULT_CONFIG_JSON, JsonObject.class);
    }
}