// BalanceWidgets.swift
// TimeBankWidgetExtension
//
// 时间余额小组件 - 4 种样式
// 对应 Android: BalanceWidgetProvider / Glass / System / Transparent

import WidgetKit
import SwiftUI

// MARK: - Timeline Provider

struct BalanceTimelineProvider: TimelineProvider {
    typealias Entry = BalanceEntry

    func placeholder(in context: Context) -> BalanceEntry {
        BalanceEntry(date: Date(), balanceSeconds: 3600, level: 2)
    }

    func getSnapshot(in context: Context, completion: @escaping (BalanceEntry) -> Void) {
        let entry = BalanceEntry(
            date: Date(),
            balanceSeconds: WidgetData.balanceSeconds,
            level: WidgetData.balanceLevel
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BalanceEntry>) -> Void) {
        let entry = BalanceEntry(
            date: Date(),
            balanceSeconds: WidgetData.balanceSeconds,
            level: WidgetData.balanceLevel
        )
        // 每 15 分钟刷新
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

struct BalanceEntry: TimelineEntry {
    let date: Date
    let balanceSeconds: Int64
    let level: Int

    var formattedBalance: String {
        WidgetData.formatTime(seconds: balanceSeconds)
    }
}

// MARK: - 样式 1：渐变色（对应 BalanceWidgetProvider）

struct BalanceGradientWidget: Widget {
    let kind = "BalanceGradientWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceTimelineProvider()) { entry in
            BalanceGradientView(entry: entry)
        }
        .configurationDisplayName("时间余额")
        .description("渐变色风格 - 根据余额自动变色")
        .supportedFamilies([.systemSmall])
    }
}

struct BalanceGradientView: View {
    let entry: BalanceEntry

    var body: some View {
        ZStack {
            // 渐变背景
            LevelGradient.forLevel(entry.level)

            VStack(spacing: 4) {
                Text("时间余额")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(.white.opacity(0.85))

                Text(entry.formattedBalance)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .padding()
        }
        .widgetContainerBackground()
    }
}

// MARK: - 样式 2：毛玻璃（对应 BalanceWidgetGlassProvider）

struct BalanceGlassWidget: Widget {
    let kind = "BalanceGlassWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceTimelineProvider()) { entry in
            BalanceGlassView(entry: entry)
        }
        .configurationDisplayName("时间余额 · 毛玻璃")
        .description("半透明毛玻璃风格 - 渐变色数字")
        .supportedFamilies([.systemSmall])
    }
}

struct BalanceGlassView: View {
    let entry: BalanceEntry

    var body: some View {
        ZStack {
            // 毛玻璃背景
            Color.white.opacity(0.25)

            VStack(spacing: 4) {
                Text("时间余额")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(Color(hex: "#333333").opacity(0.95))

                // 渐变色数字
                Text(entry.formattedBalance)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(LevelGradient.forLevel(entry.level))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .padding()
        }
        .widgetContainerBackground()
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.white.opacity(0.5), lineWidth: 1)
        )
    }
}

// MARK: - 样式 3：系统透明（对应 BalanceWidgetSystemProvider）

struct BalanceSystemWidget: Widget {
    let kind = "BalanceSystemWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceTimelineProvider()) { entry in
            BalanceSystemView(entry: entry)
        }
        .configurationDisplayName("时间余额 · 系统透明")
        .description("依赖系统壁纸的透明风格")
        .supportedFamilies([.systemSmall])
    }
}

struct BalanceSystemView: View {
    let entry: BalanceEntry

    var body: some View {
        ZStack {
            Color.white.opacity(0.38)

            VStack(spacing: 4) {
                Text("时间余额")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(Color(hex: "#333333"))

                Text(entry.formattedBalance)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(LevelGradient.forLevel(entry.level))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .padding()
        }
        .widgetContainerBackground()
    }
}

// MARK: - 样式 4：高透明渐变（对应 BalanceWidgetTransparentProvider）

struct BalanceTransparentWidget: Widget {
    let kind = "BalanceTransparentWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BalanceTimelineProvider()) { entry in
            BalanceTransparentView(entry: entry)
        }
        .configurationDisplayName("时间余额 · 高透明渐变")
        .description("25% 透明度渐变色 + 白色边框")
        .supportedFamilies([.systemSmall])
    }
}

struct BalanceTransparentView: View {
    let entry: BalanceEntry

    var body: some View {
        ZStack {
            LevelGradient.transparentForLevel(entry.level)

            VStack(spacing: 4) {
                Text("时间余额")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(Color(hex: "#333333"))

                Text(entry.formattedBalance)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(LevelGradient.forLevel(entry.level))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .padding()
        }
        .widgetContainerBackground()
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.white.opacity(0.6), lineWidth: 1)
        )
    }
}

// MARK: - Widget Container Background Modifier

extension View {
    /// iOS 17+ 使用 containerBackground，低版本使用传统背景
    func widgetContainerBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            return AnyView(self.containerBackground(for: .widget) {
                Color.clear
            })
        } else {
            return AnyView(self)
        }
    }
}
