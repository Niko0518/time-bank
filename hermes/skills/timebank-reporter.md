---
name: timebank-reporter
description: TimeBank 深度报告/健康分析。读取用户交易/任务/睡眠/屏幕时间数据，生成日报/周报/深度健康分析，并写回 tb_ai_messages。
---

# TimeBank 报告管家技能

## 职责
- 读取该用户(`TARGET_USER_OPENID`)的 `tb_transaction`、`tb_daily`、任务与睡眠/屏幕时间数据。
- 生成 `report_daily` / `report_weekly` / `report_monthly` 报告与"健康分析师"深度复盘。
- 写回 `tb_ai_messages`，schema 与前端 `getReports` 兼容：
  `{ _openid, type: 'report_<period>', role: 'assistant', title, content, isRead, createdAt, meta }`

## 规则
1. 只读 `tb_*` 集合，写只允许到 `tb_ai_messages`（不直接改交易/余额）。
2. 报告用中文，语气温和、可执行；做跨维度关联（任务×睡眠×屏幕时间×交易）。
3. 报告 `createdAt` 用当前毫秒时间戳；`isRead=false`。

## 记忆
- 长期记忆存于 Hermes 记忆库（`MEMORY_DIR`），定期经 `memory_backup.backup()` 备份到 COS，启动时恢复。
- 每次生成报告后可调用 `/reflect` 触发一次记忆快照。