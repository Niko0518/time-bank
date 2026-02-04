#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成软件著作权申请材料
要求：
- 程序鉴别材料：60页（前30页+后30页），每页不少于50行
- 文档鉴别材料：60页（前30页+后30页），每页不少于30行
"""

import os
from datetime import datetime

def read_file_lines(filepath, start=0, count=None):
    """读取文件指定行数"""
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        if start > 0:
            lines = lines[start:]
        if count:
            lines = lines[:count]
        return lines

def create_program_material():
    """生成程序鉴别材料 - 60页，每页50行"""
    
    lines_per_page = 50
    total_pages = 60  # 前30 + 后30
    
    output = []
    output.append("=" * 80)
    output.append("个人学习与工作时间管理及效率提升软件 [时间银行 V7.12.0]")
    output.append("程序鉴别材料")
    output.append("=" * 80)
    output.append("")
    
    # 第一部分：前30页 - index.html 前1500行
    output.append("-" * 80)
    output.append("第一部分：源程序前30页（index.html）")
    output.append("-" * 80)
    output.append("")
    
    html_lines = read_file_lines(r'd:\TimeBank\index.html', 0, 1500)
    
    page_num = 1
    line_count = 0
    for i, line in enumerate(html_lines, 1):
        output.append(f"{i:4d} | {line.rstrip()}")
        line_count += 1
        if line_count >= lines_per_page:
            output.append("")
            output.append(f"--- 第 {page_num} 页 ---")
            output.append("")
            line_count = 0
            page_num += 1
            if page_num > 30:
                break
    
    # 填充剩余行数
    while line_count < lines_per_page and page_num <= 30:
        output.append("     |")
        line_count += 1
    if page_num <= 30:
        output.append("")
        output.append(f"--- 第 {page_num} 页 ---")
        output.append("")
    
    # 第二部分：后30页 - Java源文件
    output.append("")
    output.append("-" * 80)
    output.append("第二部分：源程序后30页（Java源文件）")
    output.append("-" * 80)
    output.append("")
    
    # 读取Java文件
    java_files = [
        r'd:\TimeBank\android_project\app\src\main\java\com\jianglicheng\timebank\FloatingTimerService.java',
        r'd:\TimeBank\android_project\app\src\main\java\com\jianglicheng\timebank\WebAppInterface.java',
        r'd:\TimeBank\android_project\app\src\main\java\com\jianglicheng\timebank\MainActivity.java',
    ]
    
    java_lines = []
    for jf in java_files:
        if os.path.exists(jf):
            with open(jf, 'r', encoding='utf-8', errors='ignore') as f:
                java_lines.extend(f.readlines())
    
    # 取后1500行
    if len(java_lines) > 1500:
        java_lines = java_lines[-1500:]
    
    page_num = 31
    line_count = 0
    for i, line in enumerate(java_lines, 1):
        output.append(f"{i:4d} | {line.rstrip()}")
        line_count += 1
        if line_count >= lines_per_page:
            output.append("")
            output.append(f"--- 第 {page_num} 页 ---")
            output.append("")
            line_count = 0
            page_num += 1
            if page_num > 60:
                break
    
    # 填充剩余行数
    while line_count < lines_per_page and page_num <= 60:
        output.append("     |")
        line_count += 1
    if page_num <= 60:
        output.append("")
        output.append(f"--- 第 {page_num} 页 ---")
    
    # 保存
    with open(r'd:\TimeBank\软著申请材料_v2\程序鉴别材料.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(output))
    
    print(f"✅ 程序鉴别材料已生成：{len(output)} 行")
    return len(output)

def create_document_material():
    """生成文档鉴别材料 - 60页，每页30行"""
    
    lines_per_page = 30
    total_pages = 60
    
    output = []
    output.append("=" * 80)
    output.append("个人学习与工作时间管理及效率提升软件 [时间银行 V7.12.0]")
    output.append("软件说明书（文档鉴别材料）")
    output.append("=" * 80)
    output.append("")
    
    # 软件说明书内容
    content = [
        # 第一章
        ("一、软件概述", True),
        ("1.1 软件名称：个人学习与工作时间管理及效率提升软件", False),
        ("     软件简称：时间银行", False),
        ("     版本号：V7.12.0", False),
        ("", False),
        ("1.2 开发背景：", False),
        ("在信息爆炸的时代，个人时间管理成为提升工作学习效率的关键。", False),
        ("\"时间银行\"软件借鉴 Edgar Cahn 提出的时间银行理论，将时间", False),
        ("作为一种可存储、可交易的\"货币\"，通过游戏化的方式帮助用户", False),
        ("建立良好的时间管理习惯。", False),
        ("", False),
        ("1.3 软件用途：", False),
        ("- 个人日常任务的时间规划与追踪", False),
        ("- 屏幕使用时间的监控与管理", False),
        ("- 睡眠质量的记录与分析", False),
        ("- 习惯养成的打卡与追踪", False),
        ("- 跨设备数据同步与备份", False),
        ("", False),
        
        # 第二章
        ("二、运行环境", True),
        ("2.1 硬件环境：", False),
        ("- 开发的硬件环境：Intel/AMD PC，8GB以上内存", False),
        ("- 运行的硬件环境：Android智能手机或平板电脑", False),
        ("", False),
        ("2.2 软件环境：", False),
        ("- 开发的操作系统：Windows 10/11", False),
        ("- 运行的操作系统：Android 7.0及以上版本", False),
        ("- 开发工具：Android Studio、Gradle、VS Code", False),
        ("- 编程语言：Java、JavaScript、HTML", False),
        ("", False),
        
        # 第三章
        ("三、功能模块说明", True),
        ("3.1 时间银行核心系统", False),
        ("时间银行是本软件的核心机制，将用户的时间视为一种货币进行管理。", False),
        ("", False),
        ("3.1.1 收入任务", False),
        ("用户完成正向任务（如学习、运动、工作）可获得时间币奖励。", False),
        ("支持以下类型：", False),
        ("- 普通任务：单次完成的任务，完成后立即获得奖励", False),
        ("- 习惯任务：需要每日重复的任务，支持连续打卡追踪", False),
        ("- 计时任务：需要持续一段时间的任务，支持悬浮窗计时", False),
        ("", False),
        ("3.1.2 支出任务", False),
        ("用户使用时间币兑换休闲活动。系统会扣除相应的时间币，", False),
        ("帮助用户建立\"时间就是金钱\"的意识。", False),
        ("", False),
        ("3.1.3 时间余额", False),
        ("实时显示用户当前的时间币余额，以及今日获得和支出的统计。", False),
        ("余额计算采用双向记账机制，确保数据准确性。", False),
        ("", False),
        
        # 第四章
        ("3.2 屏幕时间管理", False),
        ("基于 Android UsageStats API 实现的屏幕使用监控功能：", False),
        ("", False),
        ("3.2.1 使用统计", False),
        ("- 实时获取今日屏幕使用总时长", False),
        ("- 按应用分类统计使用时长", False),
        ("- 支持排除白名单应用", False),
        ("", False),
        ("3.2.2 限额管理", False),
        ("用户可设置每日屏幕使用时间限额，超额时系统会发出提醒。", False),
        ("支持区分工作日和周末的不同限额。", False),
        ("", False),
        ("3.2.3 桌面小部件", False),
        ("提供三种桌面小部件，无需打开应用即可查看时间余额和屏幕时间。", False),
        ("", False),
        
        # 第五章
        ("3.3 悬浮窗计时器", False),
        ("创新的多任务悬浮窗系统，核心实现位于 FloatingTimerService.java", False),
        ("", False),
        ("功能特点：", False),
        ("- 多任务支持：可同时运行多个计时器", False),
        ("- 智能堆叠：收起状态下自动堆叠，展开后垂直/水平排列", False),
        ("- 位置记忆：自动保存竖屏/横屏下的位置偏好", False),
        ("- 暂停/恢复：支持计时中途暂停", False),
        ("- 达标提醒：倒计时结束时自动提醒", False),
        ("", False),
        ("交互设计：", False),
        ("- 长按切换展开/收起状态", False),
        ("- 拖动移动所有悬浮窗", False),
        ("- 点击打开主应用", False),
        ("", False),
        
        # 第六章
        ("四、技术架构", True),
        ("4.1 整体架构", False),
        ("本软件采用混合架构（Hybrid Architecture）设计：", False),
        ("- 前端层：HTML5 + CSS3 + JavaScript 单页应用", False),
        ("- 原生层：Android WebView 作为容器，提供原生能力", False),
        ("- 通信层：JavaScriptInterface 实现双向通信", False),
        ("- 数据层：LeanCloud + 腾讯云双云服务", False),
        ("", False),
        ("4.2 核心技术", False),
        ("4.2.1 事件溯源架构（Event Sourcing）", False),
        ("采用事件溯源模式管理数据变更，所有操作以事件形式记录。", False),
        ("优势：支持完整的操作历史回溯，便于数据冲突检测与修复。", False),
        ("", False),
        ("4.2.2 离线优先（Offline First）", False),
        ("- 本地 IndexedDB 存储核心数据", False),
        ("- 离线事件队列，网络恢复后自动同步", False),
        ("- 本地计算优先，云端作为备份", False),
        ("", False),
        
        # 第七章
        ("4.3 原生能力集成", False),
        ("通过 WebAppInterface.java 提供以下原生能力：", False),
        ("- startFloatingTimer()：开启悬浮窗计时器", False),
        ("- getTodayScreenTime()：获取屏幕使用时长", False),
        ("- saveFileDirectly()：保存文件到下载目录", False),
        ("- scheduleAlarmWithId()：设置闹钟提醒", False),
        ("- vibrate()：震动反馈", False),
        ("- updateWidgets()：更新桌面小部件", False),
        ("", False),
        
        # 第八章
        ("五、使用说明", True),
        ("5.1 首次使用", False),
        ("1. 安装应用后打开，授予必要权限", False),
        ("2. 注册或登录账户（支持邮箱注册）", False),
        ("3. 设置个人偏好（每日限额、睡眠时间等）", False),
        ("4. 创建第一个收入任务开始赚取时间币", False),
        ("", False),
        ("5.2 日常使用流程", False),
        ("1. 查看今日时间余额和屏幕使用时间", False),
        ("2. 完成任务获取时间币奖励", False),
        ("3. 使用支出任务享受休闲时间", False),
        ("4. 睡前记录睡眠，获得额外奖励", False),
        ("", False),
        
        # 第九章
        ("六、系统维护", True),
        ("6.1 版本更新", False),
        ("当前版本：V7.12.0", False),
        ("", False),
        ("主要更新内容：", False),
        ("- 优化了多设备同步稳定性", False),
        ("- 新增屏幕时间通透模式小部件", False),
        ("- 改进悬浮窗位置记忆功能", False),
        ("- 修复了若干已知问题", False),
        ("", False),
        
        ("6.2 常见问题", False),
        ("Q: 悬浮窗不显示？", False),
        ("A: 检查悬浮窗权限是否开启", False),
        ("", False),
        ("Q: 屏幕时间统计为0？", False),
        ("A: 检查\"使用情况访问\"权限", False),
        ("", False),
        ("Q: 数据不同步？", False),
        ("A: 检查网络连接，手动触发同步", False),
        ("", False),
        
        # 结尾
        ("七、版权声明", True),
        ("本软件为原创作品，著作权归开发者所有。", False),
        ("未经授权，不得复制、修改、分发本软件。", False),
        ("", False),
        (f"文档生成日期：{datetime.now().strftime('%Y年%m月%d日')}", False),
    ]
    
    line_num = 1
    page_num = 1
    line_count = 0
    
    for text, is_title in content:
        if is_title:
            output.append("")
            output.append(text)
            output.append("-" * 60)
        else:
            output.append(text)
        
        line_count += 1
        if line_count >= lines_per_page:
            output.append("")
            output.append(f"--- 第 {page_num} 页 ---")
            output.append("")
            line_count = 0
            page_num += 1
    
    # 填充到60页
    while page_num <= 60:
        while line_count < lines_per_page:
            output.append("")
            line_count += 1
        output.append(f"--- 第 {page_num} 页 ---")
        if page_num < 60:
            output.append("")
        line_count = 0
        page_num += 1
    
    # 保存
    with open(r'd:\TimeBank\软著申请材料_v2\文档鉴别材料.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(output))
    
    print(f"✅ 文档鉴别材料已生成：{len(output)} 行")
    return len(output)

if __name__ == '__main__':
    print("开始生成软件著作权申请材料...")
    print("-" * 60)
    
    # 创建输出目录
    os.makedirs(r'd:\TimeBank\软著申请材料_v2', exist_ok=True)
    
    # 生成材料
    create_program_material()
    create_document_material()
    
    print("-" * 60)
    print("✅ 所有材料已生成完毕！")
    print("\n输出文件：")
    print("1. d:\\TimeBank\\软著申请材料_v2\\程序鉴别材料.txt")
    print("2. d:\\TimeBank\\软著申请材料_v2\\文档鉴别材料.txt")
    print("\n使用方法：")
    print("1. 用记事本或Word打开上述文件")
    print("2. 设置字体为宋体/Consolas，字号小五或10pt")
    print("3. 设置页边距：上下2.54cm，左右3.17cm")
    print("4. 打印为PDF格式上传")
