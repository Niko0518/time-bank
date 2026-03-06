// TimeBankWidgetBundle.swift
// TimeBankWidgetExtension
//
// WidgetKit 入口文件
// 注册所有小组件类型

import WidgetKit
import SwiftUI

@main
struct TimeBankWidgetBundle: WidgetBundle {
    var body: some Widget {
        // 时间余额小组件（4 种样式）
        BalanceGradientWidget()
        BalanceGlassWidget()
        BalanceSystemWidget()
        BalanceTransparentWidget()
        // 屏幕时间小组件（4 种样式）
        ScreenTimeGradientWidget()
        ScreenTimeGlassWidget()
        ScreenTimeSystemWidget()
        ScreenTimeTransparentWidget()
    }
}
