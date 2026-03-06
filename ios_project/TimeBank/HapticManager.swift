// HapticManager.swift
// TimeBank
//
// 触觉反馈管理器，替代 Android 的 Vibrator
// 遵循 Apple HIG：使用 UIFeedbackGenerator 系列 API
// - 轻触：UIImpactFeedbackGenerator(.light)
// - 中等：UIImpactFeedbackGenerator(.medium)
// - 强烈：UINotificationFeedbackGenerator (success/warning/error)

import UIKit

class HapticManager {

    static let shared = HapticManager()

    private init() {}

    /// 震动反馈
    /// - Parameter milliseconds: 震动时长（毫秒），映射到不同强度的触觉反馈
    func vibrate(milliseconds: Int) {
        DispatchQueue.main.async {
            if milliseconds <= 20 {
                // 轻触反馈（如按钮点击）
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.prepare()
                generator.impactOccurred()
            } else if milliseconds <= 100 {
                // 中等反馈（如操作确认）
                let generator = UIImpactFeedbackGenerator(style: .medium)
                generator.prepare()
                generator.impactOccurred()
            } else if milliseconds <= 300 {
                // 强烈反馈（如警告）
                let generator = UIImpactFeedbackGenerator(style: .heavy)
                generator.prepare()
                generator.impactOccurred()
            } else {
                // 超长震动：使用通知反馈 + 延迟重复
                let generator = UINotificationFeedbackGenerator()
                generator.prepare()
                generator.notificationOccurred(.warning)

                // 对于较长的震动，多次触发
                let repeatCount = min(milliseconds / 300, 5)
                for i in 1..<repeatCount {
                    DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.3) {
                        let g = UIImpactFeedbackGenerator(style: .heavy)
                        g.prepare()
                        g.impactOccurred()
                    }
                }
            }
        }
    }

    /// 成功反馈
    func success() {
        DispatchQueue.main.async {
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(.success)
        }
    }

    /// 警告反馈
    func warning() {
        DispatchQueue.main.async {
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(.warning)
        }
    }

    /// 错误反馈
    func error() {
        DispatchQueue.main.async {
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(.error)
        }
    }

    /// 选择变化反馈（如列表滑动选择）
    func selectionChanged() {
        DispatchQueue.main.async {
            let generator = UISelectionFeedbackGenerator()
            generator.prepare()
            generator.selectionChanged()
        }
    }
}
