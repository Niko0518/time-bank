// SceneDelegate.swift
// TimeBank

import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }
        
        let window = UIWindow(windowScene: windowScene)
        let viewController = MainViewController()
        window.rootViewController = viewController
        window.makeKeyAndVisible()
        self.window = window
    }

    func sceneDidDisconnect(_ scene: UIScene) {}

    func sceneDidBecomeActive(_ scene: UIScene) {
        // 从后台恢复时通知前端
        NotificationCenter.default.post(name: .appDidBecomeActive, object: nil)
    }

    func sceneWillResignActive(_ scene: UIScene) {}

    func sceneWillEnterForeground(_ scene: UIScene) {
        NotificationCenter.default.post(name: .appWillEnterForeground, object: nil)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {}
}

extension Notification.Name {
    static let appDidBecomeActive = Notification.Name("appDidBecomeActive")
    static let appWillEnterForeground = Notification.Name("appWillEnterForeground")
}
