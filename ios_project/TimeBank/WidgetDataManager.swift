// WidgetDataManager.swift
// TimeBank
//
// 小组件数据管理器
// 使用 App Groups 共享数据（UserDefaults suite）
// 供 WidgetKit Extension 读取

import Foundation
import WidgetKit

class WidgetDataManager {

    static let shared = WidgetDataManager()

    // App Groups ID（需要在 Xcode 中配置）
    private let suiteName = "group.com.jianglicheng.timebank"
    private let defaults: UserDefaults

    private init() {
        defaults = UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
    }

    /// 更新余额数据
    func updateBalance(seconds: Int64) {
        defaults.set(seconds, forKey: "currentBalance")
        defaults.set(Date().timeIntervalSince1970, forKey: "lastUpdated")
        reloadWidgets()
    }

    /// 更新屏幕时间数据
    func updateScreenTime(dailyLimitMinutes: Int, usedMinutes: Int) {
        defaults.set(dailyLimitMinutes, forKey: "dailyLimitMinutes")
        defaults.set(usedMinutes, forKey: "screenTimeUsed")
        defaults.set(Date().timeIntervalSince1970, forKey: "lastUpdated")
        reloadWidgets()
    }

    /// 读取余额
    func getBalance() -> Int64 {
        return Int64(defaults.integer(forKey: "currentBalance"))
    }

    /// 读取每日限额
    func getDailyLimitMinutes() -> Int {
        return defaults.integer(forKey: "dailyLimitMinutes")
    }

    /// 读取屏幕时间使用量
    func getScreenTimeUsed() -> Int {
        return defaults.integer(forKey: "screenTimeUsed")
    }

    /// 通知 WidgetKit 刷新所有小组件时间线
    func reloadWidgets() {
        WidgetCenter.shared.reloadAllTimelines()
    }
}
