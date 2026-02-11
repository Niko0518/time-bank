import json
from datetime import datetime

with open('log&data/错误数据/timebank_backup_2026-02-11.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Find abstinence tasks
abstinence_ids = []
for t in data.get('tasks', []):
    hd = t.get('habitDetails', {})
    if hd and hd.get('type') == 'abstinence':
        abstinence_ids.append(t['id'])
        print(f"=== {t['name']} (id={t['id']}) ===")
        print(f"  lastSettledDate: {repr(hd.get('lastSettledDate'))}")
        print(f"  streak: {hd.get('streak')}")
        print(f"  period: {hd.get('period')}")
        print(f"  targetCountInPeriod: {hd.get('targetCountInPeriod')}")
        print(f"  bestStreak: {hd.get('bestStreak')}")
        print(f"  rewards: {hd.get('rewards')}")
        print(f"  planStartDate: {hd.get('planStartDate')}")
        print(f"  planDuration: {hd.get('planDuration')}")
        print()

# Recent streak rewards
print("=== ALL isStreakAdvancement transactions (Feb 1-11) ===")
count = 0
for tx in data.get('transactions', []):
    if tx.get('isStreakAdvancement') and tx.get('timestamp', '') >= '2026-02-01':
        tn = tx.get('taskName', '?')
        amt = tx.get('amount', 0)
        desc = tx.get('description', '')[:80]
        ts = tx.get('timestamp', '')[:16]
        print(f"  {ts} | {tn} | +{amt}s | {desc}")
        count += 1
print(f"  Total: {count}")

# Check all reward history for 金铲铲之战
print("\n=== 金铲铲之战 ALL streak rewards ever ===")
for tx in data.get('transactions', []):
    tid = tx.get('taskId')
    if tid and str(tid) == '1761905886241' and tx.get('isStreakAdvancement'):
        ts = tx.get('timestamp', '')[:16]
        print(f"  {ts} | +{tx.get('amount',0)}s | {tx.get('description','')[:80]}")

# Check 刷抖音 recent rewards
print("\n=== 刷抖音 streak rewards (Jan 2026+) ===")
for tx in data.get('transactions', []):
    if tx.get('isStreakAdvancement') and '抖音' in tx.get('taskName', '') and tx.get('timestamp', '') >= '2026-01':
        ts = tx.get('timestamp', '')[:16]
        print(f"  {ts} | +{tx.get('amount',0)}s | {tx.get('description','')[:80]}")
