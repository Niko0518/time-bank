import json
import copy
from datetime import datetime, timedelta
import uuid

INPUT_FILE = 'log&data/错误数据/timebank_backup_2026-02-11.json'
OUTPUT_FILE = 'log&data/错误数据/timebank_backup_2026-02-11_repaired.json'

with open(INPUT_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

TASK_ID = '1761905886241'
TASK_NAME = '金铲铲之战'
LIMIT_MINUTES = 45
REWARD_SECONDS = 1800  # fixed from day>=1

# ====== Step 1: Compute daily consumption ======
task_txs = [tx for tx in data['transactions'] if str(tx.get('taskId','')) == TASK_ID and not tx.get('undone')]

from collections import defaultdict
daily_spend_minutes = defaultdict(int)
daily_has_reward = set()

for tx in task_txs:
    ts = tx.get('timestamp','')
    if not ts: continue
    dt = datetime.fromisoformat(ts.replace('Z','+00:00')) if 'Z' in ts else datetime.fromisoformat(ts)
    if dt.tzinfo:
        local_dt = dt + timedelta(hours=8)
    else:
        local_dt = dt
    date_str = local_dt.strftime('%Y-%m-%d')
    
    if tx.get('isStreakAdvancement'):
        daily_has_reward.add(date_str)
        continue
    
    if tx.get('type') == 'spend' or (not tx.get('type') and tx.get('amount',0) < 0):
        secs = 0
        if isinstance(tx.get('rawSeconds'), (int, float)):
            secs = tx['rawSeconds']
        elif tx.get('autoDetectData') and isinstance(tx['autoDetectData'].get('actualMinutes'), (int, float)):
            secs = tx['autoDetectData']['actualMinutes'] * 60
        else:
            secs = abs(tx.get('amount', 0))
        daily_spend_minutes[date_str] += secs // 60

# ====== Step 2: Find missing reward days ======
start_date = datetime(2026, 1, 4)  # First day within limit
end_date = datetime(2026, 2, 10)   # Yesterday

missing_days = []
streak_history = []
streak = 0
best_streak = 0

current = start_date
while current <= end_date:
    date_str = current.strftime('%Y-%m-%d')
    consumed = daily_spend_minutes.get(date_str, 0)
    
    if consumed <= LIMIT_MINUTES:
        streak += 1
        if streak > best_streak:
            best_streak = streak
        has_reward = date_str in daily_has_reward
        if not has_reward:
            missing_days.append((date_str, consumed, streak))
        streak_history.append((date_str, consumed, streak, has_reward))
    else:
        if streak > 0:
            streak_history.append((date_str, consumed, 0, False))
        streak = 0
    
    current += timedelta(days=1)

print(f"Missing reward days: {len(missing_days)}")
print(f"Final streak: {streak}, Best streak: {best_streak}")
print()

# ====== Step 3: Create reward transactions ======
new_transactions = []
total_reward = 0

for date_str, consumed, streak_at_time in missing_days:
    # Timestamp: 02:24 of the NEXT day (matching other abstinence settlement times)
    settle_date = datetime.fromisoformat(date_str) + timedelta(days=1, hours=2, minutes=24)
    ts = settle_date.strftime('%Y-%m-%dT%H:%M:%S.000+08:00')
    
    # Generate unique ID
    tx_id = f"fix_abstinence_{date_str}_{uuid.uuid4().hex[:8]}"
    
    tx = {
        "id": tx_id,
        "type": "earn",
        "taskId": TASK_ID,
        "taskName": TASK_NAME,
        "amount": REWARD_SECONDS,
        "description": f"戒除挑战成功 [补发奖励]: {TASK_NAME} (额度 {consumed}/{LIMIT_MINUTES})",
        "isStreakAdvancement": True,
        "timestamp": ts,
        "isSystem": False
    }
    new_transactions.append(tx)
    total_reward += REWARD_SECONDS
    print(f"  + {date_str}: streak={streak_at_time}, consumed={consumed} min, reward=+{REWARD_SECONDS}s")

print(f"\nTotal new transactions: {len(new_transactions)}")
print(f"Total reward: {total_reward}s = {total_reward//60} min = {total_reward//3600}h{(total_reward%3600)//60}m")

# ====== Step 4: Add transactions to data ======
data['transactions'].extend(new_transactions)

# Sort transactions by timestamp
data['transactions'].sort(key=lambda t: t.get('timestamp', ''))

# ====== Step 5: Update task habitDetails ======
for task in data['tasks']:
    if str(task.get('id','')) == TASK_ID:
        task['habitDetails']['streak'] = streak  # Current streak (Feb 8-10 = 3)
        task['habitDetails']['lastSettledDate'] = '2026-02-10'
        task['habitDetails']['bestStreak'] = best_streak
        task['habitDetails']['isBroken'] = False
        print(f"\nTask updated:")
        print(f"  streak: {streak}")
        print(f"  lastSettledDate: 2026-02-10")
        print(f"  bestStreak: {best_streak}")
        break

# ====== Step 6: Update balance ======
old_balance = data.get('currentBalance', 0)
new_balance = old_balance + total_reward
data['currentBalance'] = new_balance
print(f"\nBalance: {old_balance}s → {new_balance}s (+ {total_reward}s = +{total_reward//60} min)")

# ====== Step 7: Save ======
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\nSaved to: {OUTPUT_FILE}")
print("Done!")
