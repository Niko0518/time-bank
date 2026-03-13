// WebBridge.swift
// TimeBank
//
// iOS 原生桥接层，替代 Android 的 WebAppInterface
// 使用 WKScriptMessageHandler 实现 JS ↔ Native 通信
//
// Android 使用 window.Android.xxx() 同步调用
// iOS 使用 window.webkit.messageHandlers.xxx.postMessage() 异步调用
// 为了兼容前端，注入 window.iOS 对象，提供与 Android 类似的同步接口
// 对于需要返回值的方法，使用 prompt() 拦截方案实现同步返回

import UIKit
import WebKit
import UserNotifications
import AudioToolbox

class WebBridge: NSObject {

    // MARK: - Properties
    private weak var webView: WKWebView?
    private weak var viewController: MainViewController?
    private let defaults = UserDefaults.standard
    private let notificationHelper = NotificationHelper.shared
    private let hapticManager = HapticManager.shared

    // 消息处理器名称
    private static let handlerName = "timeBankBridge"

    init(webView: WKWebView, viewController: MainViewController) {
        self.webView = webView
        self.viewController = viewController
        super.init()
    }

    // MARK: - Registration
    func register() {
        guard let webView = webView else { return }

        // 注册消息处理器
        webView.configuration.userContentController.add(
            LeakAvoider(delegate: self),
            name: Self.handlerName
        )

        // 注入 JS 桥接对象
        // 使用 prompt() 拦截方案实现同步返回值
        let bridgeScript = WKUserScript(
            source: Self.bridgeJavaScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        webView.configuration.userContentController.addUserScript(bridgeScript)
    }

    // MARK: - Bridge JavaScript
    /// 注入到前端的桥接 JS 代码
    /// 创建 window.iOS 对象，模拟 Android 的同步调用方式
    /// 同时将部分方法映射到 window.Android 以兼容现有前端代码
    private static let bridgeJavaScript: String = """
    (function() {
        'use strict';

        // 回调存储
        const _callbacks = {};
        let _callbackId = 0;

        // 异步调用原生方法
        function callNativeAsync(method, params) {
            return new Promise((resolve) => {
                const id = ++_callbackId;
                _callbacks[id] = resolve;
                window.webkit.messageHandlers.timeBankBridge.postMessage({
                    method: method,
                    params: params || {},
                    callbackId: id
                });
                // 超时兜底
                setTimeout(() => {
                    if (_callbacks[id]) {
                        _callbacks[id](null);
                        delete _callbacks[id];
                    }
                }, 10000);
            });
        }

        // 同步调用原生方法（通过 prompt 拦截）
        function callNativeSync(method, params) {
            try {
                const result = window.prompt('__TB_BRIDGE__' + JSON.stringify({
                    method: method,
                    params: params || {}
                }));
                if (result && result !== 'undefined' && result !== 'null') {
                    try { return JSON.parse(result); } catch(e) { return result; }
                }
                return result;
            } catch(e) {
                console.error('[iOS Bridge] sync call error:', method, e);
                return null;
            }
        }

        // 原生回调入口
        window.__timeBankBridgeCallback = function(id, result) {
            if (_callbacks[id]) {
                _callbacks[id](result);
                delete _callbacks[id];
            }
        };

        // ========== window.iOS 对象 ==========
        window.iOS = {
            // 设备信息
            getDeviceId: function() {
                return callNativeSync('getDeviceId');
            },

            // 震动反馈
            vibrate: function(ms) {
                callNativeAsync('vibrate', { milliseconds: ms || 15 });
            },

            // 文件操作
            saveFileDirectly: function(content, fileName) {
                callNativeAsync('saveFileDirectly', { content: content, fileName: fileName });
            },

            presentFilePicker: function() {
                callNativeAsync('presentFilePicker');
            },

            // 通知
            showNotification: function(title, message) {
                callNativeAsync('showNotification', { title: title, message: message });
            },

            hasPostNotificationPermission: function() {
                return callNativeSync('hasPostNotificationPermission') === true;
            },
            
            openAppNotificationSettings: function() {
                callNativeAsync('openAppNotificationSettings');
            },

            // 闹钟
            scheduleAlarm: function(title, message, delayMs) {
                callNativeAsync('scheduleAlarm', { title: title, message: message, delayMs: delayMs });
            },

            cancelAlarm: function() {
                callNativeAsync('cancelAlarm');
            },

            scheduleAlarmWithId: function(alarmId, title, message, delayMs) {
                callNativeAsync('scheduleAlarmWithId', {
                    alarmId: alarmId, title: title, message: message, delayMs: delayMs
                });
            },

            cancelAlarmWithId: function(alarmId) {
                callNativeAsync('cancelAlarmWithId', { alarmId: alarmId });
            },

            canScheduleExactAlarms: function() { return true; },

            // 系统闹钟同步（iOS 不支持，返回兼容值）
            canSetSystemAlarm: function() { return false; },
            syncSystemAlarm: function() { return false; },
            syncSystemAlarmWithResult: function() {
                return JSON.stringify({ success: false, reason: 'not_supported_on_ios' });
            },
            dismissSystemAlarmWithResult: function() {
                return JSON.stringify({ success: false, reason: 'not_supported_on_ios' });
            },

            // 悬浮窗计时器（iOS 使用 Live Activity 替代）
            startFloatingTimer: function(taskName, durationSeconds, colorHex, appPackage) {
                callNativeAsync('startFloatingTimer', {
                    taskName: taskName, durationSeconds: durationSeconds,
                    colorHex: colorHex, appPackage: appPackage
                });
            },
            stopFloatingTimer: function(taskName) {
                callNativeAsync('stopFloatingTimer', { taskName: taskName });
            },
            pauseFloatingTimer: function(taskName) {
                callNativeAsync('pauseFloatingTimer', { taskName: taskName });
            },
            resumeFloatingTimer: function(taskName) {
                callNativeAsync('resumeFloatingTimer', { taskName: taskName });
            },
            canDrawOverlays: function() { return true; },
            openOverlaySettings: function() {},

            // 导航栏高度（由 Safe Area 自动处理）
            getNavigationBarHeight: function() {
                return callNativeSync('getNavigationBarHeight') || 0;
            },

            // 屏幕时间（iOS 无 UsageStats 等效 API，返回兼容值）
            hasUsageStatsPermission: function() { return false; },
            openUsageAccessSettings: function() {
                callNativeAsync('openAppSettings');
            },
            getTodayScreenTime: function() { return -1; },
            getInstalledApps: function() { return '[]'; },
            getAppUsageList: function() { return '[]'; },
            getAppScreenTime: function() { return -1; },
            getScreenTimeForDate: function() { return -1; },
            getAppScreenTimeForDate: function() { return -1; },

            // 电池优化（iOS 不需要）
            isIgnoringBatteryOptimizations: function() { return true; },
            requestIgnoreBatteryOptimizations: function() {},

            // 登录凭据
            saveLoginEmail: function(email) {
                callNativeAsync('saveLoginEmail', { email: email });
            },
            getSavedLoginEmail: function() {
                return callNativeSync('getSavedLoginEmail') || '';
            },
            clearSavedLoginEmail: function() {
                callNativeAsync('clearSavedLoginEmail');
            },
            saveLoginCredentials: function(email, password) {
                callNativeAsync('saveLoginCredentials', { email: email, password: password });
            },
            getSavedLoginPassword: function() {
                return callNativeSync('getSavedLoginPassword') || '';
            },
            isAutoLoginEnabled: function() {
                return callNativeSync('isAutoLoginEnabled') === true;
            },
            clearLoginCredentials: function() {
                callNativeAsync('clearLoginCredentials');
            },
            setAutoLoginEnabled: function(enabled) {
                callNativeAsync('setAutoLoginEnabled', { enabled: enabled });
            },
            setExpectedLoggedIn: function(isLoggedIn) {
                callNativeAsync('setExpectedLoggedIn', { isLoggedIn: isLoggedIn });
            },
            getExpectedLoggedIn: function() {
                return callNativeSync('getExpectedLoggedIn') === true;
            },

            // 设置持久化
            saveScreenTimeSettingsNative: function(json) {
                callNativeAsync('saveSettingsNative', { key: 'screenTimeSettings', value: json });
            },
            getScreenTimeSettingsNative: function() {
                return callNativeSync('getSettingsNative', { key: 'screenTimeSettings' }) || '';
            },
            saveSleepSettingsNative: function(json) {
                callNativeAsync('saveSettingsNative', { key: 'sleepSettings', value: json });
            },
            getSleepSettingsNative: function() {
                return callNativeSync('getSettingsNative', { key: 'sleepSettings' }) || '';
            },
            saveSleepStateNative: function(json) {
                callNativeAsync('saveSettingsNative', { key: 'sleepState', value: json });
            },
            getSleepStateNative: function() {
                return callNativeSync('getSettingsNative', { key: 'sleepState' }) || '';
            },

            // 调试
            nativeLog: function(tag, message) {
                callNativeAsync('nativeLog', { tag: tag, message: message });
            },

            // 悬浮窗同步状态（iOS 简化版）
            getPendingFloatingTimerAction: function() { return ''; },
            getFloatingTimerSyncState: function() { return ''; },
            clearFloatingTimerSyncState: function() {},

            // 开机自启（iOS 不支持）
            isBootAutoStartEnabled: function() { return false; },
            setBootAutoStartEnabled: function() {},
            openAppDetailsSettings: function() {
                callNativeAsync('openAppSettings');
            },
            openBootAutoStartSettings: function() { return false; },

            // 小组件（iOS 使用 WidgetKit）
            canAddWidget: function() { return false; },
            addWidgetToHomeScreen: function() {},
            updateWidgets: function(balanceSeconds, dailyLimitMinutes, whitelistAppsJson) {
                callNativeAsync('updateWidgets', {
                    balanceSeconds: balanceSeconds,
                    dailyLimitMinutes: dailyLimitMinutes,
                    whitelistAppsJson: whitelistAppsJson
                });
            },

            // 启动外部应用（iOS 通过 URL Scheme）
            launchApp: function(packageName) {
                callNativeAsync('launchApp', { packageName: packageName });
            },

            // 精准闹钟设置（iOS 不需要）
            openExactAlarmSettings: function() {},
            openAlarmSettings: function() {
                callNativeAsync('openAppSettings');
            },

            // 状态栏高度
            getStatusBarHeight: function() {
                return callNativeSync('getStatusBarHeight') || 0;
            },

            // 原生 Tab 同步（前端 switchTab → 更新原生 Tab Bar 选中态）
            setNativeTabIndex: function(tabName) {
                callNativeAsync('setNativeTabIndex', { tabName: tabName });
            }
        };

        // ========== 兼容层：将 iOS 方法映射到 window.Android ==========
        // 前端代码中大量使用 window.Android?.xxx，直接映射以最大化兼容
        window.Android = window.iOS;

        console.log('[TimeBank iOS] Bridge initialized');
    })();
    """;
}

// MARK: - WKScriptMessageHandler
extension WebBridge: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName,
              let body = message.body as? [String: Any],
              let method = body["method"] as? String else {
            return
        }

        let params = body["params"] as? [String: Any] ?? [:]
        let callbackId = body["callbackId"] as? Int

        handleMessage(method: method, params: params, callbackId: callbackId)
    }

    private func handleMessage(method: String, params: [String: Any], callbackId: Int?) {

        switch method {
        // ===== 设备信息 =====
        case "getDeviceId":
            sendCallback(callbackId, result: getDeviceId())

        // ===== 震动 =====
        case "vibrate":
            let ms = params["milliseconds"] as? Int ?? 15
            hapticManager.vibrate(milliseconds: ms)

        // ===== 文件操作 =====
        case "saveFileDirectly":
            if let content = params["content"] as? String,
               let fileName = params["fileName"] as? String {
                DispatchQueue.main.async { [weak self] in
                    self?.viewController?.exportFile(content: content, fileName: fileName)
                }
            }

        case "presentFilePicker":
            DispatchQueue.main.async { [weak self] in
                self?.viewController?.presentDocumentPicker()
            }

        // ===== 通知 =====
        case "showNotification":
            if let title = params["title"] as? String,
               let message = params["message"] as? String {
                notificationHelper.showNotification(title: title, body: message)
            }

        case "hasPostNotificationPermission":
            notificationHelper.checkPermission { granted in
                self.sendCallback(callbackId, result: granted)
            }

        case "openAppNotificationSettings", "openAppSettings":
            DispatchQueue.main.async {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }

        // ===== 闹钟 =====
        case "scheduleAlarm":
            if let title = params["title"] as? String,
               let message = params["message"] as? String,
               let delayMs = params["delayMs"] as? Double {
                notificationHelper.scheduleAlarm(title: title, body: message, delayMs: delayMs, identifier: "alarm_default")
            }

        case "cancelAlarm":
            notificationHelper.cancelAlarm(identifier: "alarm_default")

        case "scheduleAlarmWithId":
            if let alarmId = params["alarmId"] as? Int,
               let title = params["title"] as? String,
               let message = params["message"] as? String,
               let delayMs = params["delayMs"] as? Double {
                notificationHelper.scheduleAlarm(title: title, body: message, delayMs: delayMs, identifier: "alarm_\(alarmId)")
            }

        case "cancelAlarmWithId":
            if let alarmId = params["alarmId"] as? Int {
                notificationHelper.cancelAlarm(identifier: "alarm_\(alarmId)")
            }

        // ===== 悬浮窗计时器（Live Activity 简化版）=====
        case "startFloatingTimer":
            if let taskName = params["taskName"] as? String,
               let durationSeconds = params["durationSeconds"] as? Int {
                TimerActivityManager.shared.startActivity(
                    taskName: taskName,
                    elapsedSeconds: durationSeconds
                )
            }

        case "stopFloatingTimer":
            TimerActivityManager.shared.stopActivity()

        case "pauseFloatingTimer":
            TimerActivityManager.shared.pauseActivity()

        case "resumeFloatingTimer":
            TimerActivityManager.shared.resumeActivity()

        // ===== 登录凭据 =====
        case "saveLoginEmail":
            if let email = params["email"] as? String {
                KeychainHelper.save(key: "loginEmail", value: email)
            }

        case "getSavedLoginEmail":
            sendCallback(callbackId, result: KeychainHelper.load(key: "loginEmail") ?? "")

        case "clearSavedLoginEmail":
            KeychainHelper.delete(key: "loginEmail")

        case "saveLoginCredentials":
            if let email = params["email"] as? String,
               let password = params["password"] as? String {
                KeychainHelper.save(key: "loginEmail", value: email)
                KeychainHelper.save(key: "loginPassword", value: password)
                defaults.set(true, forKey: "autoLoginEnabled")
            }

        case "getSavedLoginPassword":
            sendCallback(callbackId, result: KeychainHelper.load(key: "loginPassword") ?? "")

        case "isAutoLoginEnabled":
            sendCallback(callbackId, result: defaults.bool(forKey: "autoLoginEnabled"))

        case "clearLoginCredentials":
            KeychainHelper.delete(key: "loginPassword")
            defaults.set(false, forKey: "autoLoginEnabled")

        case "setAutoLoginEnabled":
            if let enabled = params["enabled"] as? Bool {
                defaults.set(enabled, forKey: "autoLoginEnabled")
                if !enabled {
                    KeychainHelper.delete(key: "loginPassword")
                }
            }

        case "setExpectedLoggedIn":
            if let isLoggedIn = params["isLoggedIn"] as? Bool {
                defaults.set(isLoggedIn, forKey: "expectedLoggedIn")
            }

        case "getExpectedLoggedIn":
            sendCallback(callbackId, result: defaults.bool(forKey: "expectedLoggedIn"))

        // ===== 设置持久化 =====
        case "saveSettingsNative":
            if let key = params["key"] as? String,
               let value = params["value"] as? String {
                defaults.set(value, forKey: "TB_\(key)")
            }

        case "getSettingsNative":
            if let key = params["key"] as? String {
                sendCallback(callbackId, result: defaults.string(forKey: "TB_\(key)") ?? "")
            }

        // ===== 小组件 =====
        case "updateWidgets":
            let balance = params["balanceSeconds"] as? Int64 ?? 0
            let dailyLimit = params["dailyLimitMinutes"] as? Int ?? 120
            WidgetDataManager.shared.updateBalance(seconds: balance)
            WidgetDataManager.shared.updateScreenTime(dailyLimitMinutes: dailyLimit,
                                                       usedMinutes: WidgetDataManager.shared.getScreenTimeUsed())

        // ===== 调试 =====
        case "nativeLog":
            let tag = params["tag"] as? String ?? "JS"
            let msg = params["message"] as? String ?? ""
            print("[TimeBank-\(tag)] \(msg)")

        // ===== 导航栏 =====
        case "getNavigationBarHeight":
            DispatchQueue.main.async { [weak self] in
                let bottom = self?.viewController?.view.safeAreaInsets.bottom ?? 0
                self?.sendCallback(callbackId, result: Int(bottom))
            }

        case "getStatusBarHeight":
            DispatchQueue.main.async { [weak self] in
                let top = self?.viewController?.view.safeAreaInsets.top ?? 0
                self?.sendCallback(callbackId, result: Int(top))
            }

        case "launchApp":
            // iOS 只能通过 URL Scheme 启动其他应用
            if let packageName = params["packageName"] as? String {
                // 常见应用的 URL Scheme 映射
                let urlScheme = Self.urlSchemeForPackage(packageName)
                if let url = URL(string: urlScheme), UIApplication.shared.canOpenURL(url) {
                    DispatchQueue.main.async {
                        UIApplication.shared.open(url)
                    }
                }
            }

        // ===== 原生 Tab 同步 =====
        case "setNativeTabIndex":
            if let tabName = params["tabName"] as? String {
                DispatchQueue.main.async { [weak self] in
                    self?.viewController?.hostTabBarController?.syncTabFromWeb(tabName: tabName)
                }
            }

        default:
            print("[TimeBank Bridge] Unknown method: \(method)")
        }
    }

    // MARK: - Helpers
    private func sendCallback(_ callbackId: Int?, result: Any?) {
        guard let callbackId = callbackId, let webView = webView else { return }

        var jsResult: String
        if let result = result {
            if let boolVal = result as? Bool {
                jsResult = boolVal ? "true" : "false"
            } else if let intVal = result as? Int {
                jsResult = "\(intVal)"
            } else if let int64Val = result as? Int64 {
                jsResult = "\(int64Val)"
            } else if let doubleVal = result as? Double {
                jsResult = "\(doubleVal)"
            } else if let strVal = result as? String {
                let escaped = strVal
                    .replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "'", with: "\\'")
                    .replacingOccurrences(of: "\n", with: "\\n")
                    .replacingOccurrences(of: "\r", with: "\\r")
                jsResult = "'\(escaped)'"
            } else {
                jsResult = "null"
            }
        } else {
            jsResult = "null"
        }

        let js = "window.__timeBankBridgeCallback(\(callbackId), \(jsResult));"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func getDeviceId() -> String {
        // 使用 identifierForVendor 作为设备 ID
        if let saved = defaults.string(forKey: "TB_deviceId") {
            return saved
        }
        let id = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        defaults.set(id, forKey: "TB_deviceId")
        return id
    }

    // 常见 Android 包名到 iOS URL Scheme 的映射
    private static func urlSchemeForPackage(_ packageName: String) -> String {
        let mapping: [String: String] = [
            "com.tencent.mm": "weixin://",
            "com.tencent.mobileqq": "mqq://",
            "com.sina.weibo": "sinaweibo://",
            "com.zhihu.android": "zhihu://",
            "com.ss.android.ugc.aweme": "snssdk1128://",
            "com.bilibili.app.blue": "bilibili://",
            "tv.danmaku.bili": "bilibili://",
            "com.netease.cloudmusic": "orpheuswidget://",
        ]
        return mapping[packageName] ?? "app-settings:"
    }
}

// MARK: - Prompt 拦截（实现同步返回值）
extension MainViewController {
    // 重写 WKUIDelegate 的 prompt 处理（已在 MainViewController 中）
    // 在 runJavaScriptTextInputPanelWithPrompt 中检测桥接调用
}

/// 扩展 MainViewController 的 prompt 处理，支持同步桥接调用
extension MainViewController {
    /// 处理桥接同步调用
    func handleBridgePrompt(_ prompt: String) -> String? {
        let prefix = "__TB_BRIDGE__"
        guard prompt.hasPrefix(prefix) else { return nil }

        let jsonStr = String(prompt.dropFirst(prefix.count))
        guard let data = jsonStr.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let method = json["method"] as? String else {
            return nil
        }

        let params = json["params"] as? [String: Any] ?? [:]
        return bridge.handleSyncCall(method: method, params: params)
    }
}

// 同步调用处理
extension WebBridge {
    func handleSyncCall(method: String, params: [String: Any]) -> String? {
        switch method {
        case "getDeviceId":
            return getDeviceId()

        case "hasPostNotificationPermission":
            // 同步检查（使用缓存值）
            return defaults.bool(forKey: "TB_notificationGranted") ? "true" : "false"

        case "getSavedLoginEmail":
            return KeychainHelper.load(key: "loginEmail") ?? ""

        case "getSavedLoginPassword":
            return KeychainHelper.load(key: "loginPassword") ?? ""

        case "isAutoLoginEnabled":
            return defaults.bool(forKey: "autoLoginEnabled") ? "true" : "false"

        case "getExpectedLoggedIn":
            return defaults.bool(forKey: "expectedLoggedIn") ? "true" : "false"

        case "getSettingsNative":
            if let key = params["key"] as? String {
                return defaults.string(forKey: "TB_\(key)") ?? ""
            }
            return ""

        case "getNavigationBarHeight":
            let bottom = viewController?.view.safeAreaInsets.bottom ?? 0
            return "\(Int(bottom))"

        case "getStatusBarHeight":
            let top = viewController?.view.safeAreaInsets.top ?? 0
            return "\(Int(top))"

        case "canScheduleExactAlarms":
            return "true"

        case "canSetSystemAlarm":
            return "false"

        case "syncSystemAlarmWithResult":
            return "{\"success\":false,\"reason\":\"not_supported_on_ios\"}"

        case "dismissSystemAlarmWithResult":
            return "{\"success\":false,\"reason\":\"not_supported_on_ios\"}"

        case "hasUsageStatsPermission":
            return "false"

        case "isIgnoringBatteryOptimizations":
            return "true"

        case "isBootAutoStartEnabled":
            return "false"

        case "canAddWidget":
            return "false"

        case "getInstalledApps":
            return "[]"

        case "getAppUsageList":
            return "[]"

        case "getTodayScreenTime":
            return "-1"

        case "getAppScreenTime":
            return "-1"

        case "getScreenTimeForDate":
            return "-1"

        case "getAppScreenTimeForDate":
            return "-1"

        case "getPendingFloatingTimerAction":
            return ""

        case "getFloatingTimerSyncState":
            return ""

        case "canDrawOverlays":
            return "true"

        default:
            return nil
        }
    }
}

// MARK: - LeakAvoider
/// 避免 WKScriptMessageHandler 导致的循环引用
class LeakAvoider: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}
