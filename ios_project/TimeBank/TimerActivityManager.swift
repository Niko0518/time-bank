// TimerActivityManager.swift
// TimeBank
//
// 计时器活动管理器
// iOS 上没有悬浮窗，使用以下方案替代：
// 1. iOS 16.1+ 使用 Live Activities (Dynamic Island / 锁屏实时活动)
// 2. 回退方案：使用本地通知持续显示计时状态
//
// 本文件提供统一接口，具体实现根据 iOS 版本自动选择

import Foundation
import UserNotifications
import ActivityKit

class TimerActivityManager {

    static let shared = TimerActivityManager()

    // MARK: - State
    private(set) var isRunning = false
    private(set) var isPaused = false
    private(set) var taskName: String = ""
    private var elapsedSeconds: Int = 0
    private var timer: Timer?
    private var startDate: Date?

    // Live Activity 引用
    private var currentActivity: Any? // Activity<TimerActivityAttributes>，用 Any 避免低版本编译问题

    private init() {}

    // MARK: - Public API

    /// 开始计时活动
    func startActivity(taskName: String, elapsedSeconds: Int) {
        // 先停止已有活动
        if isRunning { stopActivity() }

        self.taskName = taskName
        self.elapsedSeconds = elapsedSeconds
        self.isRunning = true
        self.isPaused = false
        self.startDate = Date()

        // 优先尝试 Live Activity，失败则降级到通知
        if #available(iOS 16.1, *) {
            startLiveActivity()
        } else {
            startTimerNotification()
        }
        startUpdateTimer()

        print("[TimeBank Timer] Started: \(taskName), elapsed: \(elapsedSeconds)s")
    }

    /// 停止计时活动
    func stopActivity() {
        isRunning = false
        isPaused = false
        stopUpdateTimer()

        if #available(iOS 16.1, *) {
            endLiveActivity()
        }
        removeTimerNotification()

        print("[TimeBank Timer] Stopped: \(taskName)")
    }

    /// 暂停
    func pauseActivity() {
        guard isRunning, !isPaused else { return }
        isPaused = true

        // 更新已经过的时间
        if let start = startDate {
            elapsedSeconds += Int(Date().timeIntervalSince(start))
        }
        startDate = nil
        stopUpdateTimer()

        if #available(iOS 16.1, *) {
            updateLiveActivity()
        }
        updateTimerNotification()

        print("[TimeBank Timer] Paused: \(taskName), elapsed: \(elapsedSeconds)s")
    }

    /// 恢复
    func resumeActivity() {
        guard isRunning, isPaused else { return }
        isPaused = false
        startDate = Date()
        startUpdateTimer()

        if #available(iOS 16.1, *) {
            updateLiveActivity()
        }
        updateTimerNotification()

        print("[TimeBank Timer] Resumed: \(taskName)")
    }

    /// 获取当前已计时秒数
    func getCurrentElapsedTime() -> Int {
        var totalSeconds = elapsedSeconds
        if !isPaused, let start = startDate {
            totalSeconds += Int(Date().timeIntervalSince(start))
        }
        return totalSeconds
    }

    // MARK: - Live Activities (iOS 16.1+)

    @available(iOS 16.1, *)
    private func startLiveActivity() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("[TimeBank Timer] Live Activities not authorized, falling back to notification")
            startTimerNotification()
            return
        }

        let attributes = TimerActivityAttributes(
            taskName: taskName,
            startTimestamp: Date().timeIntervalSince1970
        )

        let state = TimerActivityAttributes.ContentState(
            elapsedSeconds: elapsedSeconds,
            isPaused: false,
            lastUpdateTimestamp: Date().timeIntervalSince1970
        )

        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil),
                pushType: nil
            )
            currentActivity = activity
            print("[TimeBank Timer] Live Activity started: \(activity.id)")
        } catch {
            print("[TimeBank Timer] Failed to start Live Activity: \(error), falling back to notification")
            startTimerNotification()
        }
    }

    @available(iOS 16.1, *)
    private func updateLiveActivity() {
        guard let activity = currentActivity as? Activity<TimerActivityAttributes> else { return }

        let state = TimerActivityAttributes.ContentState(
            elapsedSeconds: getCurrentElapsedTime(),
            isPaused: isPaused,
            lastUpdateTimestamp: Date().timeIntervalSince1970
        )

        Task {
            await activity.update(
                ActivityContent(state: state, staleDate: nil)
            )
        }
    }

    @available(iOS 16.1, *)
    private func endLiveActivity() {
        guard let activity = currentActivity as? Activity<TimerActivityAttributes> else { return }

        let finalState = TimerActivityAttributes.ContentState(
            elapsedSeconds: getCurrentElapsedTime(),
            isPaused: true,
            lastUpdateTimestamp: Date().timeIntervalSince1970
        )

        Task {
            await activity.end(
                ActivityContent(state: finalState, staleDate: nil),
                dismissalPolicy: .immediate
            )
        }
        currentActivity = nil
    }

    // MARK: - Fallback: Notification-based Timer Display

    private func startTimerNotification() {
        updateTimerNotification()
    }

    private func updateTimerNotification() {
        let content = UNMutableNotificationContent()
        content.title = isPaused ? "⏸ \(taskName)" : "⏱ \(taskName)"

        let totalSeconds = getCurrentElapsedTime()
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60

        if hours > 0 {
            content.body = String(format: "已计时 %d:%02d:%02d", hours, minutes, seconds)
        } else {
            content.body = String(format: "已计时 %02d:%02d", minutes, seconds)
        }

        content.categoryIdentifier = "TIMER"
        content.sound = nil
        content.interruptionLevel = .passive

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "timer_active",
            content: content,
            trigger: trigger
        )

        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    private func removeTimerNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: ["timer_active"]
        )
        UNUserNotificationCenter.current().removeDeliveredNotifications(
            withIdentifiers: ["timer_active"]
        )
    }

    // MARK: - Update Timer

    private func startUpdateTimer() {
        stopUpdateTimer()
        // Live Activity 更新间隔 10s，通知 30s
        let interval: TimeInterval
        if #available(iOS 16.1, *), currentActivity != nil {
            interval = 10
        } else {
            interval = 30
        }
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if #available(iOS 16.1, *) {
                self.updateLiveActivity()
            }
            self.updateTimerNotification()
        }
    }

    private func stopUpdateTimer() {
        timer?.invalidate()
        timer = nil
    }
}
