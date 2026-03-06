// MainViewController.swift
// TimeBank
//
// 主界面控制器：承载 WKWebView，替代 Android 的 MainActivity
// 遵循 Apple HIG：
// - 使用 WKWebView 加载本地 HTML
// - 支持 Safe Area 适配
// - 支持深色模式自动跟随
// - 支持文件选择(导入/导出)
// - 支持下载处理

import UIKit
import WebKit
import UniformTypeIdentifiers

class MainViewController: UIViewController {

    // MARK: - Properties
    private var webView: WKWebView!
    var bridge: WebBridge!

    // MARK: - Lifecycle
    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        setupBridge()
        setupObservers()
        loadLocalHTML()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        webView.frame = view.bounds
        // 通知前端 Safe Area 信息
        updateSafeAreaInsets()
    }

    override var prefersStatusBarHidden: Bool {
        return false
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        // 跟随系统深色模式
        if traitCollection.userInterfaceStyle == .dark {
            return .lightContent
        }
        return .darkContent
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        // 系统深浅色切换时通知前端（使用 Android 回调名称，因为前端仅定义了该回调）
        if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
            let isDark = traitCollection.userInterfaceStyle == .dark
            let js = "window.__onAndroidUiModeChanged && window.__onAndroidUiModeChanged(\(isDark));"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    // MARK: - WebView Setup
    private func setupWebView() {
        let config = WKWebViewConfiguration()

        // 允许内联播放媒体
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // 数据持久化：WKWebView 默认使用持久性 dataStore
        config.websiteDataStore = WKWebsiteDataStore.default()

        // 注入 iOS 平台标识脚本（在页面加载前执行）
        let platformScript = WKUserScript(
            source: """
            window.__platform = 'ios';
            window.__isIOS = true;
            // 兼容层：将 iOS bridge 映射到 window.iOS 命名空间
            // 前端通过 window.iOS?.xxx 调用原生方法
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(platformScript)

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        // 允许 WebKit 开发者调试（Xcode 连接 Safari Web Inspector）
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        // 背景色跟随系统
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground

        // 防止橡皮筋弹跳效果（可选，根据 app 设计决定）
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = true

        // 在 iOS 上禁用长按弹出菜单（可选）
        // webView.allowsLinkPreview = false

        // 导航代理
        webView.navigationDelegate = self
        webView.uiDelegate = self

        view.addSubview(webView)
    }

    private func setupBridge() {
        bridge = WebBridge(webView: webView, viewController: self)
        bridge.register()
    }

    private func setupObservers() {
        // 监听前台恢复事件
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidBecomeActive),
            name: .appDidBecomeActive,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppWillEnterForeground),
            name: .appWillEnterForeground,
            object: nil
        )
    }

    @objc private func handleAppDidBecomeActive() {
        // 通知前端深浅色状态（使用 Android 回调名称兼容共享前端）
        let isDark = traitCollection.userInterfaceStyle == .dark
        let js = "window.__onAndroidUiModeChanged && window.__onAndroidUiModeChanged(\(isDark));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    @objc private func handleAppWillEnterForeground() {
        // 触发 visibilitychange 兼容逻辑（前端依赖标准 visibilitychange 事件）
        // WKWebView 会自动触发 visibilitychange，此处无需额外 JS 调用
    }

    // MARK: - Load HTML
    private func loadLocalHTML() {
        guard let wwwURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") else {
            print("[TimeBank] ERROR: www/index.html not found in bundle")
            showLoadError()
            return
        }
        let wwwDir = wwwURL.deletingLastPathComponent()
        webView.loadFileURL(wwwURL, allowingReadAccessTo: wwwDir)
    }

    private func showLoadError() {
        let alert = UIAlertController(
            title: "加载失败",
            message: "无法找到应用资源文件，请尝试重新安装。",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "确定", style: .default))
        present(alert, animated: true)
    }

    // MARK: - Safe Area
    private func updateSafeAreaInsets() {
        let insets = view.safeAreaInsets
        let js = """
        if (window.__setIOSSafeAreaInsets) {
            window.__setIOSSafeAreaInsets({
                top: \(insets.top),
                bottom: \(insets.bottom),
                left: \(insets.left),
                right: \(insets.right)
            });
        }
        // 兼容 Android 状态栏高度接口
        if (window.__setAndroidNavBarHeight) {
            window.__setAndroidNavBarHeight(\(insets.bottom));
        }
        // 设置 CSS 变量
        document.documentElement.style.setProperty('--safe-area-top', '\(insets.top)px');
        document.documentElement.style.setProperty('--safe-area-bottom', '\(insets.bottom)px');
        document.documentElement.style.setProperty('--status-bar-height', '\(insets.top)px');
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - File Import
    func presentDocumentPicker() {
        let types: [UTType] = [.json, .data]
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
        picker.delegate = self
        picker.modalPresentationStyle = .formSheet
        present(picker, animated: true)
    }

    // MARK: - File Export
    func exportFile(content: String, fileName: String) {
        guard let data = content.data(using: .utf8) else { return }

        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        do {
            try data.write(to: tempURL)
            let activityVC = UIActivityViewController(
                activityItems: [tempURL],
                applicationActivities: nil
            )
            // iPad 需要指定 popover 来源
            if let popover = activityVC.popoverPresentationController {
                popover.sourceView = view
                popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            present(activityVC, animated: true)
        } catch {
            print("[TimeBank] Export file error: \(error)")
            showToast(message: "❌ 导出失败: \(error.localizedDescription)")
        }
    }

    // MARK: - Toast (iOS style)
    func showToast(message: String, duration: TimeInterval = 2.5) {
        let toastLabel = UILabel()
        toastLabel.text = message
        toastLabel.textAlignment = .center
        toastLabel.font = .systemFont(ofSize: 14, weight: .medium)
        toastLabel.textColor = .white
        toastLabel.backgroundColor = UIColor.black.withAlphaComponent(0.75)
        toastLabel.numberOfLines = 0
        toastLabel.layer.cornerRadius = 12
        toastLabel.clipsToBounds = true

        let maxWidth = view.bounds.width - 60
        let size = toastLabel.sizeThatFits(CGSize(width: maxWidth, height: CGFloat.greatestFiniteMagnitude))
        let width = min(size.width + 32, maxWidth)
        let height = size.height + 20

        toastLabel.frame = CGRect(
            x: (view.bounds.width - width) / 2,
            y: view.bounds.height - view.safeAreaInsets.bottom - height - 60,
            width: width,
            height: height
        )

        view.addSubview(toastLabel)

        UIView.animate(withDuration: 0.3, delay: duration, options: .curveEaseOut) {
            toastLabel.alpha = 0
        } completion: { _ in
            toastLabel.removeFromSuperview()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}

// MARK: - WKNavigationDelegate
extension MainViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url {
            // 外部链接用 Safari 打开
            if url.scheme == "http" || url.scheme == "https" {
                if url.host != nil && !url.isFileURL {
                    // 如果是 CloudBase 等 SDK 需要的请求，允许在 WebView 内加载
                    // 仅外部导航链接才跳转 Safari
                    if navigationAction.navigationType == .linkActivated {
                        UIApplication.shared.open(url)
                        decisionHandler(.cancel)
                        return
                    }
                }
            }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView,
                 didFinish navigation: WKNavigation!) {
        updateSafeAreaInsets()
        // 通知前端当前深浅色模式（使用 Android 回调名称兼容共享前端）
        let isDark = traitCollection.userInterfaceStyle == .dark
        let js = "window.__onAndroidUiModeChanged && window.__onAndroidUiModeChanged(\(isDark));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

// MARK: - WKUIDelegate
extension MainViewController: WKUIDelegate {
    // 处理 JavaScript alert()
    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in
            completionHandler()
        })
        present(alert, animated: true)
    }

    // 处理 JavaScript confirm()
    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in
            completionHandler(false)
        })
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in
            completionHandler(true)
        })
        present(alert, animated: true)
    }

    // 处理 JavaScript prompt() — 同时作为同步 Bridge 通道
    func webView(_ webView: WKWebView,
                 runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        // 优先检查是否是 Bridge 同步调用
        if let result = handleBridgePrompt(prompt) {
            completionHandler(result)
            return
        }

        // 非 Bridge 调用，显示标准 prompt 对话框
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { textField in
            textField.text = defaultText
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in
            completionHandler(nil)
        })
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        present(alert, animated: true)
    }
}

// MARK: - UIDocumentPickerDelegate
extension MainViewController: UIDocumentPickerDelegate {
    func documentPicker(_ controller: UIDocumentPickerViewController,
                        didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        do {
            let data = try Data(contentsOf: url)
            if let content = String(data: data, encoding: .utf8) {
                // 将文件内容传递给前端
                let escapedContent = content
                    .replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "'", with: "\\'")
                    .replacingOccurrences(of: "\n", with: "\\n")
                    .replacingOccurrences(of: "\r", with: "\\r")
                // 模拟 <input type="file"> 的 onchange 事件，复用前端 importData() 完整流程
                let js = """
                (function() {
                    try {
                        var content = '\(escapedContent)';
                        var blob = new Blob([content], { type: 'application/json' });
                        var file = new File([blob], 'import.json', { type: 'application/json' });
                        var dt = new DataTransfer();
                        dt.items.add(file);
                        var input = document.getElementById('importFile');
                        if (input) {
                            input.files = dt.files;
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            console.error('[iOS] importFile input not found');
                        }
                    } catch(e) {
                        console.error('[iOS] File import error:', e);
                    }
                })();
                """
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        } catch {
            print("[TimeBank] File import error: \(error)")
            showToast(message: "❌ 导入失败: \(error.localizedDescription)")
        }
    }
}
