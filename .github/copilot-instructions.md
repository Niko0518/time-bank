# Time Bank - AI 编程指南

## 项目架构
Time Bank 是一个 **混合开发 (Hybrid) 的安卓应用**，结合了原生 Java 外壳和基于 WebView 的前端界面。

- **原生层 (Java)**: 处理应用生命周期、权限、系统服务（闹钟、通知、悬浮窗、小组件）以及文件读写。
  - **入口点**: [MainActivity.java](app/src/main/java/com/jianglicheng/timebank/MainActivity.java) 初始化 WebView 并处理权限请求。
  - **JS 桥接**: [WebAppInterface.java](app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java) 作为桥梁 (`window.Android`)，将原生能力暴露给 JavaScript。
  - **服务**: 包含 [FloatingTimerService.java](app/src/main/java/com/jianglicheng/timebank/FloatingTimerService.java) 用于悬浮窗计时，以及处理闹钟/启动的广播接收器。

- **前端层 (Web)**:
  - **核心文件**: [index.html](app/src/main/assets/www/index.html) 包含了 UI 的 **所有** HTML、CSS 和 JavaScript 逻辑。这是一个巨大的单体文件（约 1.9 万行）。
  - **资源**: 位于 [app/src/main/assets/www/](app/src/main/assets/www/)。
  - **Service Worker**: [sw.js](app/src/main/assets/www/sw.js) 处理离线缓存。
  - **云端**: 使用 LeanCloud (`av-live-query-min.js`) 进行数据同步。

## 关键工作流

### 1. 前端开发
- **文件**: `app/src/main/assets/www/index.html`
- **模式**: 原生 JavaScript (Vanilla JS)，用于主题的 CSS 变量，以及直接的 DOM 操作。
- **注意**: 由于 `index.html` 非常巨大，编辑前务必阅读足够的上下文。使用 `replace_string_in_file` 时要使用精确的搜索字符串。
- **版本控制**: 在注释中标记重要的逻辑变更，例如 `/* [v6.2.0] 新功能 */`。

### 2. 原生桥接集成 (Native Bridge)
添加新的原生功能步骤：
1.  **定义接口**: 在 [WebAppInterface.java](app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java) 中添加带有 `@JavascriptInterface` 的公共方法。
    ```java
    @JavascriptInterface
    public void newFeature(String param) { ... }
    ```
2.  **JS 调用**: 在 `index.html` 中通过全局 `Android` 对象调用：
    ```javascript
    if (window.Android && window.Android.newFeature) {
        window.Android.newFeature("value");
    }
    ```

### 3. Android 清单与权限
- 敏感权限（悬浮窗 `SYSTEM_ALERT_WINDOW`，精准闹钟 `SCHEDULE_EXACT_ALARM`）在 `MainActivity.java` 中请求，或在 `WebAppInterface.java` 中懒加载请求。
- 如果添加的功能需要新权限，请通过 [AndroidManifest.xml](app/src/main/AndroidManifest.xml) 更新，并在 Java 代码中处理运行时请求。

## 项目约定
- **主题**: 支持浅色/深色模式，使用 CSS 变量（例如 `--bg-gradient-themed`）和标准的 `prefers-color-scheme` 媒体查询。
- **数据存储**:
  - **本地**: `localStorage` (通过 WebView 设置)。
  - **文件**: 通过 `WebAppInterface.saveFileDirectly` 直接将 JSON 备份导出到 Android 下载 (`Downloads/`) 目录。
  - **云端**: LeanCloud AV 对象。
- **构建**: 标准 Gradle 构建。
  - 命令: `./gradlew assembleDebug`
  - 输出: `app/build/outputs/apk/debug/`

## 上下文提示
- **小组件 (Widgets)**: 主屏幕小组件在 `*WidgetProvider.java` 文件中实现，并且独立于 WebView 更新。
- **悬浮计时器**: 实现为前台服务 (`FloatingTimerService.java`)，以便在应用外部运行。
