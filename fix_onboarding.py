# -*- coding: utf-8 -*-
import re

# 读取文件
with open(r'd:\TimeBank\android_project\app\src\main\assets\www\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 查找 taskOnboardingSteps 的位置
old_pattern = r"const taskOnboardingSteps = \[\s*\{[^}]+id: 'fab'[^]]+\];"

# 新的内容
new_content = """// [v7.10.2] 重新设计的任务引导流程 - 以「练吉他」为例
const taskOnboardingSteps = [
    {
        id: 'fab',
        selector: '#fabButton',
        title: '创建入口',
        text: '点击右下角「+」可以创建新任务。现在，我们先看看一个配置完善的示例。',
        tab: 'earn'
    },
    {
        id: 'pick-guitar-task',
        title: '🎸 一起看看这个任务',
        text: '「练吉他」是一个达标任务，让我们看看它的各项配置。',
        tab: 'earn',
        getTarget: () => findOnboardingTaskByName('练吉他'),
        scrollIntoView: true
    },
    {
        id: 'menu-edit',
        title: '进入编辑',
        text: '点击菜单中的「✏️ 编辑」，进入任务配置界面。',
        tab: 'earn',
        getTarget: () => getOnboardingEditMenuItem(),
        ensure: () => openOnboardingMenuEdit(getOnboardingEditTaskId()),
        scrollIntoView: true
    },
    {
        id: 'edit-type',
        title: '任务类型：达标任务',
        text: '达标任务需要累积到设定时长才能获得额外奖励，适合需要持续专注的活动。',
        getTarget: () => document.getElementById('taskTypeTrigger'),
        ensure: () => openOnboardingEditTask(getOnboardingEditTaskId())
    },
    {
        id: 'edit-category',
        title: '任务分类',
        text: '可以选择已有的分类标签，也可以直接输入新分类，系统会自动记住。',
        getTarget: () => document.getElementById('taskCategory'),
        ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
        scrollIntoView: true
    },
    {
        id: 'edit-multiplier',
        title: '获得倍率',
        text: '倍率决定单位时间的收益。灵活调整倍率，可随时激励高价值行为或适度克制。',
        getTarget: () => getVisibleElement('#multiplierGroup'),
        ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
        scrollIntoView: true
    },
    {
        id: 'edit-target',
        title: '目标时长',
        text: '设定达标所需的累积时长，达到目标后可获得基础收益之外的额外奖励。',
        getTarget: () => getVisibleElement('#targetTimeGroup'),
        ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
        scrollIntoView: true
    },
    {
        id: 'edit-bonus',
        title: '达标额外奖励',
        text: '完成目标时长后一次性获得的奖励，是对坚持到底的额外激励！',
        getTarget: () => getVisibleElement('#bonusRewardGroup'),
        ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
        scrollIntoView: true
    },
    {
        id: 'edit-habit-toggle',
        title: '设置为习惯',
        text: '开启后可设置打卡周期和连胜奖励，帮助养成长期好习惯。试着打开开关看看！',
        getTarget: () => getVisibleElement('#habitToggleContainer'),
        ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
        scrollIntoView: true
    },
    {
        id: 'edit-habit-settings',
        title: '习惯设置',
        text: '设置打卡周期（每日/每周等）、目标次数和每日上限，构建你的习惯养成计划。',
        getTarget: () => getVisibleElement('#habitSettingsGroup'),
        ensure: () => { openOnboardingEditTask(getOnboardingEditTaskId()); ensureOnboardingHabitEnabled(); },
        scrollIntoView: true,
        waitTime: 200
    },
    {
        id: 'edit-add-reward',
        title: '添加奖励规则',
        text: '点击可添加阶梯奖励，例如「连续 3 天额外奖励 5 分钟」，让坚持更有动力！',
        getTarget: () => document.querySelector('#habitSettingsGroup button[onclick*="addHabitRewardRule"]'),
        ensure: () => { openOnboardingEditTask(getOnboardingEditTaskId()); ensureOnboardingHabitEnabled(); },
        scrollIntoView: true
    },
    {
        id: 'edit-extras',
        title: '更多实用功能',
        text: '「设置提醒」定时通知，「关联应用」自动启动 App，「悬浮窗」实时显示进度——针对特定任务，这些功能能大放异彩。',
        getTarget: () => getVisibleElement('#reminderToggleContainer'),
        ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
        scrollIntoView: true
    },
    {
        id: 'edit-save',
        title: '保存任务',
        text: '一切就绪！点击「保存」完成配置。基础引导到此结束，开始你的时间管理之旅吧！',
        getTarget: () => getVisibleElement('#submitBtn'),
        ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
        scrollIntoView: true,
        waitTime: 260
    }
];"""

# 寻找 taskOnboardingSteps 开始位置
start_marker = "const taskOnboardingSteps = ["
start_idx = content.find(start_marker)
if start_idx == -1:
    print("未找到 taskOnboardingSteps 起始位置")
    exit(1)

print(f"找到 taskOnboardingSteps 起始位置: {start_idx}")

# 找到匹配的 ]; 结束位置
# 需要计算括号层级
bracket_count = 0
end_idx = start_idx
found_first_bracket = False
for i in range(start_idx, len(content)):
    char = content[i]
    if char == '[':
        bracket_count += 1
        found_first_bracket = True
    elif char == ']':
        bracket_count -= 1
        if found_first_bracket and bracket_count == 0:
            # 找到结尾的 ];
            end_idx = i + 1
            if content[i+1] == ';':
                end_idx = i + 2
            break

print(f"找到 taskOnboardingSteps 结束位置: {end_idx}")
print(f"原内容长度: {end_idx - start_idx}")

# 替换
new_file_content = content[:start_idx] + new_content + content[end_idx:]

# 写入
with open(r'd:\TimeBank\android_project\app\src\main\assets\www\index.html', 'w', encoding='utf-8') as f:
    f.write(new_file_content)

print("替换完成！")
