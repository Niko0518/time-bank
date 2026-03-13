// MainTabBarController.swift
// TimeBank
//
// 原生 UITabBarController — iOS 26 液态玻璃自动适配
// 替代前端 HTML .bottom-tabs，实现原生 Tab 导航
// Tab 切换通过 JS Bridge 驱动前端 switchTab()
//
// 架构：
//   MainTabBarController (root)
//     └── 单个 WebContentViewController (共享 WebView)
//          └── WKWebView (index.html)

import UIKit
import WebKit

class MainTabBarController: UITabBarController, UITabBarControllerDelegate {

    // MARK: - Properties
    /// 真正承载 WebView 的内容控制器（仅一个实例）
    private(set) var webContentVC: MainViewController!
    /// Tab 名称映射前端 switchTab() 参数
    private let tabIds = ["earn", "spend", "report", "settings"]
    /// 占位 VC 列表（Tab 切换时不实际切换 VC，只调用 JS）
    private var tabPlaceholders: [UIViewController] = []
    /// 当前激活的 tab index
    private var currentTabIndex: Int = 0
    /// 是否由前端触发的 tab 切换（防止循环调用）
    private var isSyncingFromWeb = false

    // MARK: - Lifecycle
    override func viewDidLoad() {
        super.viewDidLoad()
        delegate = self

        setupWebContentVC()
        setupTabs()
        setupTabBarAppearance()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // 确保 WebView 始终铺满 tab bar 上方区域
        webContentVC.view.frame = view.bounds
    }

    // MARK: - Setup
    private func setupWebContentVC() {
        webContentVC = MainViewController()
        // 将 tabBarController 引用传入，方便 bridge 回调
        webContentVC.hostTabBarController = self
        addChild(webContentVC)
        view.addSubview(webContentVC.view)
        webContentVC.view.frame = view.bounds
        webContentVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webContentVC.didMove(toParent: self)
    }

    private func setupTabs() {
        let tabConfigs: [(title: String, icon: String, selectedIcon: String)] = [
            ("获得时间", "clock.arrow.circlepath", "clock.arrow.circlepath"),
            ("消费时间", "target", "target"),
            ("报告",     "chart.bar.fill", "chart.bar.fill"),
            ("设置",     "gearshape", "gearshape.fill"),
        ]

        tabPlaceholders = tabConfigs.enumerated().map { index, config in
            let vc = UIViewController()
            vc.view.backgroundColor = .clear
            vc.tabBarItem = UITabBarItem(
                title: config.title,
                image: UIImage(systemName: config.icon),
                selectedImage: UIImage(systemName: config.selectedIcon)
            )
            vc.tabBarItem.tag = index
            return vc
        }

        setViewControllers(tabPlaceholders, animated: false)
        selectedIndex = 0

        // Tab 栏置于最上层
        view.bringSubviewToFront(tabBar)
    }

    private func setupTabBarAppearance() {
        // iOS 15+ UITabBarAppearance
        let appearance = UITabBarAppearance()

        if #available(iOS 26, *) {
            // iOS 26: 系统自动应用液态玻璃效果
            // 不需要手动配置，UITabBarController 自带 Liquid Glass
            // 但我们仍可设置基础色调
            appearance.configureWithDefaultBackground()
        } else {
            // iOS 15-25: 半透明毛玻璃效果
            appearance.configureWithDefaultBackground()
            appearance.backgroundEffect = UIBlurEffect(style: .systemChromeMaterial)
            appearance.shadowColor = .separator
        }

        tabBar.standardAppearance = appearance
        if #available(iOS 15.0, *) {
            tabBar.scrollEdgeAppearance = appearance
        }

        // 选中/未选中的色调
        tabBar.tintColor = UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark
                ? UIColor.systemBlue
                : UIColor.systemBlue
        }
        tabBar.unselectedItemTintColor = .secondaryLabel
    }

    // MARK: - Tab Switching
    /// 原生 Tab 点击 → 通知前端切换页面
    func tabBarController(_ tabBarController: UITabBarController,
                          shouldSelect viewController: UIViewController) -> Bool {
        guard let index = tabPlaceholders.firstIndex(of: viewController),
              index < tabIds.count else { return false }

        // 如果是前端触发的同步，不需要回调前端
        guard !isSyncingFromWeb else { return true }

        let tabName = tabIds[index]
        currentTabIndex = index

        // 调用前端 switchTab
        let js = "typeof switchTab === 'function' && switchTab('\(tabName)');"
        webContentVC.evaluateJavaScript(js)

        return true
    }

    /// 前端 switchTab → 更新原生 Tab 选中状态（由 WebBridge 调用）
    func syncTabFromWeb(tabName: String) {
        guard let index = tabIds.firstIndex(of: tabName) else { return }
        guard index != selectedIndex else { return }

        isSyncingFromWeb = true
        selectedIndex = index
        currentTabIndex = index
        isSyncingFromWeb = false
    }

    /// 提供当前 tab 高度给前端做布局适配
    var tabBarHeight: CGFloat {
        return tabBar.frame.height
    }
}
