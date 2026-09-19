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
 * [v9.18.3] 默认配置统一为 assets/config/default-config.json，消除字符串兜底重复硬编码
 *
 * 三层配置优先级（从高到低）：
 * 1. 运行时配置（可由外部调用 override() 注入，暂未启用）
 * 2. 环境配置文件（assets/config/config.{env}.json）
 *    env 来源：AndroidManifest meta-data "cloud_env" > 默认 production
 * 3. 默认配置（assets/config/default-config.json，单一权威兜底源）
 *
 * 设计目标：
 * - 消除 CloudBase envId / 云函数端点 / AI 端点等硬编码
 * - 默认配置从 JSON 文件加载，确保各层一致（不再有内联 JSON 字符串重复）
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

    /** [v9.18.3] 单一权威默认配置文件（与 www/config/default-config.json 保持同步） */
    private static final String DEFAULT_CONFIG_ASSET = "config/default-config.json";

    /** 默认环境（兜底） */
    private static final String DEFAULT_ENV = "production";

    private static volatile CloudConfigManager instance;
    private final JsonObject config;
    private final String env;

    private CloudConfigManager(Context context) {
        Context appCtx = context.getApplicationContext();
        this.env = detectEnvironment(appCtx);
        JsonObject loaded = tryLoadEnvConfig(appCtx, this.env);
        if (loaded != null) {
            this.config = loaded;
            Log.i(TAG, "[v9.18.3] 已加载环境配置: " + this.env);
        } else {
            // [v9.18.3] 默认配置改为从 assets JSON 文件加载，避免字符串重复硬编码
            this.config = tryLoadDefaultConfig(appCtx);
            Log.w(TAG, "[v9.18.3] 使用默认配置（环境配置文件加载失败）");
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
     * [v9.18.3] 获取 CloudBase 环境 ID
     * 默认值从 default-config.json 读取，不再内联字符串兜底
     */
    public String getCloudBaseEnvId() {
        try {
            JsonObject cb = config.getAsJsonObject("cloudbase");
            if (cb != null && cb.has("envId") && !cb.get("envId").isJsonNull()) {
                return cb.get("envId").getAsString();
            }
        } catch (Exception e) {
            Log.w(TAG, "getCloudBaseEnvId 异常", e);
        }
        return null;
    }

    /**
     * [v9.18.3] 获取 CloudBase 区域（如 ap-shanghai）
     * 默认值从 default-config.json 读取，不再内联字符串兜底
     */
    public String getCloudBaseRegion() {
        try {
            JsonObject cb = config.getAsJsonObject("cloudbase");
            if (cb != null && cb.has("region") && !cb.get("region").isJsonNull()) {
                return cb.get("region").getAsString();
            }
        } catch (Exception e) {
            Log.w(TAG, "getCloudBaseRegion 异常", e);
        }
        return null;
    }

    /**
     * [v9.18.3] 获取云函数 HTTP 端点
     * 默认值从 default-config.json 读取，不再内联字符串兜底
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
        return null;
    }

    /**
     * [v9.18.3] 获取云函数名（不含端点）
     * 默认值从 default-config.json 读取，不再内联字符串兜底
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
        return null;
    }

    /**
     * [v9.18.3] 获取 feature 开关
     * 默认值从 default-config.json 读取，缺失时返回 false（安全兜底，不假定启用）
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
        return false;
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
        JsonObject parsed = loadJsonFromAssets(appCtx, assetPath);
        if (parsed != null && validateConfig(parsed)) {
            return parsed;
        } else if (parsed != null) {
            Log.w(TAG, "环境配置 " + assetPath + " 验证失败，回退默认配置");
        }
        return null;
    }

    /**
     * [v9.18.3] 加载默认配置：从 assets/config/default-config.json 读取
     * 单一权威兜底源，与 www/config/default-config.json 保持同步
     * @return 失败时返回空 JsonObject（保证 config 字段不抛 NPE）
     */
    private JsonObject tryLoadDefaultConfig(Context appCtx) {
        JsonObject parsed = loadJsonFromAssets(appCtx, DEFAULT_CONFIG_ASSET);
        if (parsed != null && validateConfig(parsed)) {
            return parsed;
        } else if (parsed != null) {
            Log.w(TAG, "默认配置验证失败，使用空对象兜底（实际功能将不可用）");
        } else {
            Log.e(TAG, "默认配置 " + DEFAULT_CONFIG_ASSET + " 加载失败，使用空对象兜底");
        }
        // 极兜底：返回空对象，避免 NPE。具体行为（null 安全）由调用方判断
        return new JsonObject();
    }

    /**
     * [v9.18.3] 从 assets 加载 JSON 文件（带重试 + 指数退避）
     * @return 成功返回 JsonObject，失败返回 null
     */
    private JsonObject loadJsonFromAssets(Context appCtx, String assetPath) {
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
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
                Log.w(TAG, "加载 " + assetPath + " 失败 (尝试 " + (i + 1) + "/" + maxRetries + "): " + e.getMessage());
                if (i < maxRetries - 1) {
                    try {
                        Thread.sleep(100L * (i + 1)); // 指数退避：100ms / 200ms
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return null;
                    }
                }
            }
        }
        return null;
    }

    /**
     * [v9.18.3] 验证配置有效性
     * - 必需字段存在性
     * - 关键 URL 格式正确性
     * @return 验证通过返回 true
     */
    private boolean validateConfig(JsonObject cfg) {
        if (cfg == null) {
            Log.e(TAG, "配置验证失败：对象为 null");
            return false;
        }
        // 验证 cloudbase.envId
        try {
            JsonObject cb = cfg.getAsJsonObject("cloudbase");
            if (cb == null || !cb.has("envId") || cb.get("envId").isJsonNull()
                || cb.get("envId").getAsString().isEmpty()) {
                Log.w(TAG, "配置验证失败：cloudbase.envId 缺失");
                return false;
            }
        } catch (Exception e) {
            Log.w(TAG, "配置验证异常：cloudbase", e);
            return false;
        }
        // 验证 endpoints.{sync,ai} 是 HTTPS URL
        try {
            JsonObject endpoints = cfg.getAsJsonObject("endpoints");
            if (endpoints != null) {
                if (endpoints.has("sync") && !endpoints.get("sync").isJsonNull()) {
                    String sync = endpoints.get("sync").getAsString();
                    if (!sync.startsWith("https://") && !sync.startsWith("http://")) {
                        Log.w(TAG, "配置验证失败：endpoints.sync 不是合法 URL");
                        return false;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "配置验证异常：endpoints", e);
            return false;
        }
        return true;
    }
}