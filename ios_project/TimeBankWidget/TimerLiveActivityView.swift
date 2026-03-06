// TimerLiveActivityView.swift
// TimeBankWidgetExtension
//
// Live Activity UI — Dynamic Island + 锁屏实时活动
// 替代 Android FloatingTimerService 悬浮窗

import SwiftUI
import WidgetKit
import ActivityKit

// 需要引用主 App 的 TimerActivityAttributes
// 在实际项目中此文件应作为 Shared 文件同时属于两个 target

/// Live Activity 展示配置
struct TimerLiveActivity: Widget {
    let kind = "TimerLiveActivity"

    var body: some WidgetConfiguration {
        // Live Activity 不使用普通的 StaticConfiguration
        // 而是通过 ActivityKit 动态管理
        // 这里提供 Widget 注册入口
        ActivityConfiguration(for: TimerActivityAttributes.self) { context in
            // 锁屏/通知中心 展示视图
            TimerLockScreenView(context: context)
        } dynamicIsland: { context in
            // Dynamic Island 展示
            DynamicIsland {
                // 展开状态
                DynamicIslandExpandedRegion(.leading) {
                    Label("计时中", systemImage: "timer")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(formatElapsed(context.state.elapsedSeconds))
                        .font(.system(.title3, design: .rounded))
                        .fontWeight(.bold)
                        .foregroundColor(context.state.isPaused ? .orange : .green)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.attributes.taskName)
                            .font(.callout)
                            .fontWeight(.medium)
                            .lineLimit(1)
                        Spacer()
                        if context.state.isPaused {
                            Image(systemName: "pause.circle.fill")
                                .foregroundColor(.orange)
                        }
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                // 紧凑模式 - 左侧
                Image(systemName: context.state.isPaused ? "pause.circle" : "timer")
                    .foregroundColor(context.state.isPaused ? .orange : .green)
            } compactTrailing: {
                // 紧凑模式 - 右侧
                Text(formatElapsedCompact(context.state.elapsedSeconds))
                    .font(.system(.caption, design: .rounded))
                    .fontWeight(.bold)
                    .monospacedDigit()
                    .foregroundColor(context.state.isPaused ? .orange : .green)
            } minimal: {
                // 最小模式（与其他 Live Activity 共享时）
                Image(systemName: "timer")
                    .foregroundColor(.green)
            }
        }
    }
}

// MARK: - 锁屏视图

struct TimerLockScreenView: View {
    let context: ActivityViewContext<TimerActivityAttributes>

    var body: some View {
        HStack(spacing: 12) {
            // 左侧 - 任务图标和名称
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: context.state.isPaused ? "pause.circle.fill" : "timer")
                        .font(.caption)
                        .foregroundColor(context.state.isPaused ? .orange : .green)
                    Text(context.state.isPaused ? "已暂停" : "计时中")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                Text(context.attributes.taskName)
                    .font(.callout)
                    .fontWeight(.semibold)
                    .lineLimit(1)
            }

            Spacer()

            // 右侧 - 计时显示
            Text(formatElapsed(context.state.elapsedSeconds))
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(context.state.isPaused ? .orange : .primary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .activityBackgroundTint(Color(.systemBackground).opacity(0.85))
    }
}

// MARK: - 格式化工具

private func formatElapsed(_ seconds: Int) -> String {
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    let s = seconds % 60
    if h > 0 {
        return String(format: "%d:%02d:%02d", h, m, s)
    }
    return String(format: "%02d:%02d", m, s)
}

private func formatElapsedCompact(_ seconds: Int) -> String {
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    if h > 0 {
        return "\(h)h\(m)m"
    }
    return "\(m)m"
}
