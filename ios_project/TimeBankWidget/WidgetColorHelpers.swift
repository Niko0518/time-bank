// WidgetColorHelpers.swift
// TimeBankWidgetExtension
//
// SwiftUI 颜色工具：十六进制转换、渐变生成

import SwiftUI

extension Color {
    /// 从十六进制字符串初始化颜色
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b, a: Double
        switch hex.count {
        case 6:
            (r, g, b, a) = (
                Double((int >> 16) & 0xFF) / 255,
                Double((int >> 8) & 0xFF) / 255,
                Double(int & 0xFF) / 255,
                1.0
            )
        case 8:
            (r, g, b, a) = (
                Double((int >> 24) & 0xFF) / 255,
                Double((int >> 16) & 0xFF) / 255,
                Double((int >> 8) & 0xFF) / 255,
                Double(int & 0xFF) / 255
            )
        default:
            (r, g, b, a) = (0.5, 0.5, 0.5, 1.0)
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

/// 根据等级生成渐变
struct LevelGradient {
    static func forLevel(_ level: Int) -> LinearGradient {
        let colors = LevelColors.forLevel(level)
        return LinearGradient(
            gradient: Gradient(colors: [
                Color(hex: colors.startHex),
                Color(hex: colors.endHex)
            ]),
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    /// 25% 透明度渐变（用于高透明渐变样式）
    static func transparentForLevel(_ level: Int) -> LinearGradient {
        let colors = LevelColors.forLevel(level)
        return LinearGradient(
            gradient: Gradient(colors: [
                Color(hex: colors.startHex).opacity(0.25),
                Color(hex: colors.endHex).opacity(0.25)
            ]),
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}
