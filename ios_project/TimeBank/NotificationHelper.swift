// NotificationHelper.swift
// TimeBank
//
// 本地通知管理器，替代 Android 的 AlarmReceiver
// 使用 UNUserNotificationCenter 实现定时提醒
// 遵循 Apple HIG：
// - 使用 UNNotificationSound.defaultCritical 实现强提醒
// - 支持分类操作按钮
// - 支持锁屏直接展示

import UIKit
import UserNotifications

class NotificationHelper: NSObject {

    static let shared = NotificationHelper()

    private let center = UNUserNotificationCenter.current()

    private override init() {
        super.init()
        center.delegate = self
        setupCategories()
    }

    // MARK: - Permission
    func checkPermission(completion: @escaping (Bool) -> Void) {
        center.getNotificationSettings { settings in
            let granted = settings.authorizationStatus == .authorized
            UserDefaults.standard.set(granted, forKey: "TB_notificationGranted")
            DispatchQueue.main.async {
                completion(granted)
            }
        }
    }

    func requestPermission(completion: @escaping (Bool) -> Void) {
        center.requestAuthorization(options: [.alert, .sound, .badge, .criticalAlert]) { granted, error in
            if let error = error {
                print("[TimeBank] Notification permission error: \(error)")
            }
            UserDefaults.standard.set(granted, forKey: "TB_notificationGranted")
            DispatchQueue.main.async {
                completion(granted)
            }
        }
    }

    // MARK: - Categories
    private func setupCategories() {
        // 闹钟类通知 - 带操作按钮
        let snoozeAction = UNNotificationAction(
            identifier: "SNOOZE",
            title: "稍后提醒",
            options: []
        )
        let dismissAction = UNNotificationAction(
            identifier: "DISMISS",
            title: "关闭",
            options: [.destructive]
        )
        let alarmCategory = UNNotificationCategory(
            identifier: "ALARM",
            actions: [snoozeAction, dismissAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        // 计时器通知
        let timerCategory = UNNotificationCategory(
            identifier: "TIMER",
            actions: [dismissAction],
            intentIdentifiers: [],
            options: []
        )

        center.setNotificationCategories([alarmCategory, timerCategory])
    }

    // MARK: - Schedule Alarm
    func scheduleAlarm(title: String, body: String, delayMs: Double, identifier: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.categoryIdentifier = "ALARM"
        content.sound = UNNotificationSound.defaultCritical
        content.interruptionLevel = .timeSensitive

        let delaySeconds = max(delayMs / 1000.0, 1.0)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delaySeconds, repeats: false)

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)

        center.add(request) { error in
            if let error = error {
                print("[TimeBank] Schedule alarm error: \(error)")
            } else {
                print("[TimeBank] Alarm scheduled: \(identifier), delay: \(delaySeconds)s")
            }
        }
    }

    // MARK: - Cancel Alarm
    func cancelAlarm(identifier: String) {
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.removeDeliveredNotifications(withIdentifiers: [identifier])
        print("[TimeBank] Alarm cancelled: \(identifier)")
    }

    func cancelAllAlarms() {
        center.removeAllPendingNotificationRequests()
        center.removeAllDeliveredNotifications()
    }

    // MARK: - Simple Notification
    func showNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: trigger
        )

        center.add(request, withCompletionHandler: nil)
    }

    // MARK: - Wake Alarm (睡眠起床闹钟)
    func setWakeAlarm(timestamp: TimeInterval, alarmId: Int) {
        let now = Date().timeIntervalSince1970 * 1000
        let delayMs = timestamp - now

        if delayMs <= 0 {
            print("[TimeBank] Wake alarm skipped: time in the past")
            return
        }

        scheduleAlarm(
            title: "⏰ 起床时间到！",
            body: "该起床了，开启充满活力的新一天",
            delayMs: delayMs,
            identifier: "wake_alarm_\(alarmId)"
        )
    }

    // MARK: - Nap Alarm (小睡闹钟)
    func setNapAlarm(timestamp: TimeInterval, alarmId: Int) {
        let now = Date().timeIntervalSince1970 * 1000
        let delayMs = timestamp - now

        if delayMs <= 0 {
            print("[TimeBank] Nap alarm skipped: time in the past")
            return
        }

        scheduleAlarm(
            title: "💤 小睡结束",
            body: "小睡时间结束，该恢复活动了",
            delayMs: delayMs,
            identifier: "nap_alarm_\(alarmId)"
        )
    }
}

// MARK: - UNUserNotificationCenterDelegate
extension NotificationHelper: UNUserNotificationCenterDelegate {

    // 前台展示通知
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // 即使在前台也展示通知横幅和声音
        completionHandler([.banner, .sound, .badge])
    }

    // 用户点击通知
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let actionIdentifier = response.actionIdentifier

        switch actionIdentifier {
        case "SNOOZE":
            // 5 分钟后再次提醒
            let content = response.notification.request.content
            scheduleAlarm(
                title: content.title,
                body: content.body,
                delayMs: 5 * 60 * 1000,
                identifier: response.notification.request.identifier + "_snooze"
            )
        case "DISMISS":
            break
        default:
            break
        }

        completionHandler()
    }
}
