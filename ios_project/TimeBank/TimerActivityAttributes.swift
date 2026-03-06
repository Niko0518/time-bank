// TimerActivityAttributes.swift
// TimeBank (共享文件：主 App + Widget Extension 均需引用)
//
// Live Activity 数据模型
// iOS 16.1+ 替代 Android 悬浮窗计时器
// 支持 Dynamic Island 和锁屏实时活动

import Foundation
import ActivityKit

/// 计时器 Live Activity 的静态属性（创建时确定，不可变）
struct TimerActivityAttributes: ActivityAttributes {
    /// 动态内容（随时间更新）
    public struct ContentState: Codable, Hashable {
        /// 当前已计时秒数
        var elapsedSeconds: Int
        /// 是否暂停
        var isPaused: Bool
        /// 最后更新时间
        var lastUpdateTimestamp: TimeInterval
    }

    /// 任务名称（静态，创建时确定）
    var taskName: String
    /// 开始时间
    var startTimestamp: TimeInterval
}
