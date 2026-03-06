// ScreenTimeWidgets.swift
// TimeBankWidgetExtension
//
// 屏幕时间小组件 - 4 种样式
// 对应 Android: ScreenTimeWidgetProvider / Glass / System / Transparent

import WidgetKit
import SwiftUI

// MARK: - Timeline Provider

struct ScreenTimeTimelineProvider: TimelineProvider {
    typealias Entry = ScreenTimeEntry

    func placeholder(in context: Context) -> ScreenTimeEntry {
        ScreenTimeEntry(date: Date(), usedMinutes: 45, limitMinutes: 120, level: 1)
    }

    func getSnapshot(in context: Context, completion: @escaping (ScreenTimeEntry) -> Void) {
        let entry = ScreenTimeEntry(
            date: Date(),
            usedMinutes: WidgetData.screenTimeUsedMinutes,
            limitMinutes: WidgetData.dailyLimitMinutes,
            level: WidgetData.screenTimeLevel
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ScreenTimeEntry>) -> Void) {
        let entry = ScreenTimeEntry(
            date: Date(),
            usedMinutes: WidgetData.screenTimeUsedMinutes,
            limitMinutes: WidgetData.dailyLimitMinutes,
            level: WidgetData.screenTimeLevel
        )
        // 每 15 分钟刷新
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

struct ScreenTimeEntry: TimelineEntry {
    let date: Date
    let usedMinutes: Int
    let limitMinutes: Int
    let level: Int

    var percent: Int {
        guard limitMinutes > 0 else { return 0 }
        return usedMinutes * 100 / limitMinutes
    }

    var formattedUsed: String {
        WidgetData.formatTimeShort(minutes: usedMinutes)
    }

    var formattedLimit: String {
        WidgetData.formatTimeShort(minutes: limitMinutes)
    }

    var progressRatio: CGFloat {
        guard limitMinutes > 0 else { return 0 }
        return min(CGFloat(usedMinutes) / CGFloat(limitMinutes), 1.0)
    }
}

// MARK: - 样式 1：渐变色（对应 ScreenTimeWidgetProvider）

struct ScreenTimeGradientWidget: Widget {
    let kind = "ScreenTimeGradientWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ScreenTimeTimelineProvider()) { entry in
            ScreenTimeGradientView(entry: entry)
        }
        .configurationDisplayName("屏幕时间")
        .description("渐变色风格 - 根据使用比例变色")
        .supportedFamilies([.systemSmall])
    }
}

struct ScreenTimeGradientView: View {
    let entry: ScreenTimeEntry

    var body: some View {
        ZStack {
            LevelGradient.forLevel(entry.level)

            VStack(spacing: 6) {
                HStack {
                    Text("屏幕时间")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(.white.opacity(0.85))
                    Spacer()
                    Text("\(entry.percent)%")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                }

                // 进度条
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.white.opacity(0.3))
                            .frame(height: 6)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.white)
                            .frame(width: geometry.size.width * entry.progressRatio, height: 6)
                    }
                }
                .frame(height: 6)

                HStack {
                    Text(entry.formattedUsed)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    Text("/ \(entry.formattedLimit)")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                    Spacer()
                }
            }
            .padding()
        }
        .widgetContainerBackground()
    }
}

// MARK: - 样式 2：毛玻璃（对应 ScreenTimeWidgetGlassProvider）

struct ScreenTimeGlassWidget: Widget {
    let kind = "ScreenTimeGlassWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ScreenTimeTimelineProvider()) { entry in
            ScreenTimeGlassView(entry: entry)
        }
        .configurationDisplayName("屏幕时间 · 毛玻璃")
        .description("半透明毛玻璃风格")
        .supportedFamilies([.systemSmall])
    }
}

struct ScreenTimeGlassView: View {
    let entry: ScreenTimeEntry
    let darkText = Color(hex: "#333333")

    var body: some View {
        ZStack {
            Color.white.opacity(0.25)

            VStack(spacing: 6) {
                HStack {
                    Text("屏幕时间")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(darkText.opacity(0.95))
                    Spacer()
                    Text("\(entry.percent)%")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(LevelGradient.forLevel(entry.level))
                }

                // 渐变进度条
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.gray.opacity(0.2))
                            .frame(height: 6)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(LevelGradient.forLevel(entry.level))
                            .frame(width: geometry.size.width * entry.progressRatio, height: 6)
                    }
                }
                .frame(height: 6)

                HStack {
                    Text(entry.formattedUsed)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(LevelGradient.forLevel(entry.level))
                    Text("/ \(entry.formattedLimit)")
                        .font(.caption)
                        .foregroundColor(darkText.opacity(0.7))
                    Spacer()
                }
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

// MARK: - 样式 3：系统透明（对应 ScreenTimeWidgetSystemProvider）

struct ScreenTimeSystemWidget: Widget {
    let kind = "ScreenTimeSystemWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ScreenTimeTimelineProvider()) { entry in
            ScreenTimeSystemView(entry: entry)
        }
        .configurationDisplayName("屏幕时间 · 系统透明")
        .description("依赖系统壁纸的透明风格")
        .supportedFamilies([.systemSmall])
    }
}

struct ScreenTimeSystemView: View {
    let entry: ScreenTimeEntry
    let darkText = Color(hex: "#333333")

    var body: some View {
        ZStack {
            Color.white.opacity(0.38)

            VStack(spacing: 6) {
                HStack {
                    Text("屏幕时间")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(darkText)
                    Spacer()
                    Text("\(entry.percent)%")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(LevelGradient.forLevel(entry.level))
                }

                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.gray.opacity(0.15))
                            .frame(height: 6)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(LevelGradient.forLevel(entry.level))
                            .frame(width: geometry.size.width * entry.progressRatio, height: 6)
                    }
                }
                .frame(height: 6)

                HStack {
                    Text(entry.formattedUsed)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(LevelGradient.forLevel(entry.level))
                    Text("/ \(entry.formattedLimit)")
                        .font(.caption)
                        .foregroundColor(darkText.opacity(0.6))
                    Spacer()
                }
            }
            .padding()
        }
        .widgetContainerBackground()
    }
}

// MARK: - 样式 4：高透明渐变（对应 ScreenTimeWidgetTransparentProvider）

struct ScreenTimeTransparentWidget: Widget {
    let kind = "ScreenTimeTransparentWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ScreenTimeTimelineProvider()) { entry in
            ScreenTimeTransparentView(entry: entry)
        }
        .configurationDisplayName("屏幕时间 · 高透明渐变")
        .description("25% 透明度渐变色 + 白色边框")
        .supportedFamilies([.systemSmall])
    }
}

struct ScreenTimeTransparentView: View {
    let entry: ScreenTimeEntry
    let darkText = Color(hex: "#333333")

    var body: some View {
        ZStack {
            LevelGradient.transparentForLevel(entry.level)

            VStack(spacing: 6) {
                HStack {
                    Text("屏幕时间")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundColor(darkText)
                    Spacer()
                    Text("\(entry.percent)%")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(LevelGradient.forLevel(entry.level))
                }

                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.gray.opacity(0.15))
                            .frame(height: 6)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(LevelGradient.forLevel(entry.level))
                            .frame(width: geometry.size.width * entry.progressRatio, height: 6)
                    }
                }
                .frame(height: 6)

                HStack {
                    Text(entry.formattedUsed)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(LevelGradient.forLevel(entry.level))
                    Text("/ \(entry.formattedLimit)")
                        .font(.caption)
                        .foregroundColor(darkText.opacity(0.6))
                    Spacer()
                }
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
