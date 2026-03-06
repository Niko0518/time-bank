// SharedModels.swift
// TimeBankWidgetExtension
//
// 主 App 和 Widget Extension 共享的数据模型
// 通过 App Groups (group.com.jianglicheng.timebank) 共享

import Foundation

/// 小组件数据读取器（Widget Extension 端使用）
struct WidgetData {
    private static let suiteName = "group.com.jianglicheng.timebank"

    static var defaults: UserDefaults {
        return UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
    }

    // MARK: - 时间余额
    static var balanceSeconds: Int64 {
        return Int64(defaults.integer(forKey: "currentBalance"))
    }

    static var balanceHours: Double {
        return Double(balanceSeconds) / 3600.0
    }

    static var formattedBalance: String {
        return formatTime(seconds: balanceSeconds)
    }

    /// 余额等级 1~4
    static var balanceLevel: Int {
        let hours = balanceHours
        if hours > 24 { return 1 }       // >24h: 充足
        else if hours >= 0 { return 2 }   // 0~24h: 理想
        else if hours >= -24 { return 3 } // -24~0h: 偏少
        else { return 4 }                 // <-24h: 不足
    }

    // MARK: - 屏幕时间
    static var dailyLimitMinutes: Int {
        return defaults.integer(forKey: "dailyLimitMinutes")
    }

    static var screenTimeUsedMinutes: Int {
        return defaults.integer(forKey: "screenTimeUsed")
    }

    static var screenTimePercent: Int {
        let limit = dailyLimitMinutes
        guard limit > 0 else { return 0 }
        return screenTimeUsedMinutes * 100 / limit
    }

    /// 屏幕时间等级 1~4
    static var screenTimeLevel: Int {
        let pct = screenTimePercent
        if pct <= 33 { return 1 }
        else if pct <= 66 { return 2 }
        else if pct <= 100 { return 3 }
        else { return 4 }
    }

    static var formattedScreenTimeUsed: String {
        return formatTimeShort(minutes: screenTimeUsedMinutes)
    }

    static var formattedScreenTimeLimit: String {
        return formatTimeShort(minutes: dailyLimitMinutes)
    }

    static var lastUpdated: Date {
        let ts = defaults.double(forKey: "lastUpdated")
        return ts > 0 ? Date(timeIntervalSince1970: ts) : Date()
    }

    // MARK: - 格式化工具
    static func formatTime(seconds: Int64) -> String {
        let absSeconds = abs(seconds)
        let hours = absSeconds / 3600
        let minutes = (absSeconds % 3600) / 60
        let sign = seconds < 0 ? "-" : ""
        if hours > 0 {
            return minutes > 0 ? "\(sign)\(hours)h\(minutes)m" : "\(sign)\(hours)h"
        } else {
            return "\(sign)\(minutes)m"
        }
    }

    static func formatTimeShort(minutes: Int) -> String {
        let h = minutes / 60
        let m = minutes % 60
        if h > 0 && m > 0 { return "\(h)h\(m)m" }
        else if h > 0 { return "\(h)h" }
        else { return "\(m)m" }
    }
}

// MARK: - 颜色阶梯定义（4 级渐变）

/// 等级颜色定义
struct LevelColors {
    let startHex: String
    let endHex: String

    /// Level 1: 翠绿→青绿（理想/充足）
    static let level1 = LevelColors(startHex: "#27ae60", endHex: "#1abc9c")
    /// Level 2: 蓝→紫（正常/标准）
    static let level2 = LevelColors(startHex: "#3498db", endHex: "#9b59b6")
    /// Level 3: 橙→红（警示）
    static let level3 = LevelColors(startHex: "#f39c12", endHex: "#e74c3c")
    /// Level 4: 深红→紫红（危险）
    static let level4 = LevelColors(startHex: "#e74c3c", endHex: "#8e44ad")

    static func forLevel(_ level: Int) -> LevelColors {
        switch level {
        case 1: return .level1
        case 2: return .level2
        case 3: return .level3
        case 4: return .level4
        default: return .level2
        }
    }
}
