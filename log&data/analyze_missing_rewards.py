import json
from datetime import datetime, timedelta

with open('log&data/错误数据/timebank_backup_2026-02-11.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

TASK_ID = '1761905886241'
TASK_NAME = '金铲铲之战'
LIMIT_MINUTES = 45  # targetCountInPeriod
REWARD_SECONDS = 1800  # fixed reward from day>=1

# Get all transactions for this task
task_txs = [tx for tx in data['transactions'] if str(tx.get('taskId','')) == TASK_ID and not tx.get('undone')]

# Group spend transactions by date
from collections import defaultdict
daily_spend = defaultdict(list)
daily_earn_streak = defaultdict(list)

for tx in task_txs:
    ts = tx.get('timestamp','')
    if not ts: continue
    dt = datetime.fromisoformat(ts.replace('Z','+00:00')) if 'Z' in ts else datetime.fromisoformat(ts)
    # Use local date (assuming UTC+8)
    if dt.tzinfo:
        local_dt = dt + timedelta(hours=8)
    else:
        local_dt = dt
    date_str = local_dt.strftime('%Y-%m-%d')
    
    if tx.get('isStreakAdvancement'):
        daily_earn_streak[date_str].append(tx)
    elif tx.get('type') == 'spend' or (not tx.get('type') and tx.get('amount',0) < 0):
        daily_spend[date_str].append(tx)

# Find date range: from first transaction to 2026-02-10 (yesterday)
all_dates = set()
for tx in task_txs:
    ts = tx.get('timestamp','')
    if not ts: continue
    dt = datetime.fromisoformat(ts.replace('Z','+00:00')) if 'Z' in ts else datetime.fromisoformat(ts)
    if dt.tzinfo:
        local_dt = dt + timedelta(hours=8)
    else:
        local_dt = dt
    all_dates.add(local_dt.strftime('%Y-%m-%d'))

# Find when habit was enabled - first streak reward was Jan 6
# Let's check from Jan 1 to Feb 10
start_date = datetime(2026, 1, 1)
end_date = datetime(2026, 2, 10)  # yesterday

print("=== Daily consumption (minutes) for 金铲铲之战 ===")
print(f"Limit: {LIMIT_MINUTES} minutes/day")
print()

current = start_date
results = []
while current <= end_date:
    date_str = current.strftime('%Y-%m-%d')
    spends = daily_spend.get(date_str, [])
    
    # Calculate total consumed minutes (same logic as code)
    total_seconds = 0
    for t in spends:
        if isinstance(t.get('rawSeconds'), (int, float)):
            total_seconds += t['rawSeconds']
        elif t.get('autoDetectData') and isinstance(t['autoDetectData'].get('actualMinutes'), (int, float)):
            total_seconds += t['autoDetectData']['actualMinutes'] * 60
        else:
            total_seconds += abs(t.get('amount', 0))
    
    total_minutes = total_seconds // 60
    has_reward = len(daily_earn_streak.get(date_str, [])) > 0
    
    status = ''
    if total_minutes <= LIMIT_MINUTES:
        if has_reward:
            status = '✅ REWARDED'
        else:
            status = '⚠️ MISSING REWARD'
    else:
        status = '❌ EXCEEDED'
    
    if spends or has_reward or total_minutes == 0:
        results.append((date_str, total_minutes, has_reward, status, len(spends)))
    else:
        # No transactions at all - means no usage = success
        results.append((date_str, 0, has_reward, '⚠️ MISSING REWARD (no usage)' if not has_reward else '✅ REWARDED', 0))
    
    current += timedelta(days=1)

# Print all days
for date_str, mins, has_reward, status, n_spends in results:
    print(f"  {date_str}: {mins:3d} min ({n_spends} spends) | reward={'YES' if has_reward else 'NO':3s} | {status}")

print()
print("=== Days where reward should have been given but wasn't ===")
missing = [(d, m) for d, m, hr, s, _ in results if 'MISSING' in s]
for date_str, mins in missing:
    print(f"  {date_str}: consumed {mins} min (limit {LIMIT_MINUTES})")

print(f"\nTotal missing reward days: {len(missing)}")

# Now simulate what streak would look like
print("\n=== Simulated streak progression ===")
streak = 0
for date_str, mins, has_reward, status, _ in results:
    if mins <= LIMIT_MINUTES:
        streak += 1
        marker = ' ← reward missing' if 'MISSING' in status else ''
        print(f"  {date_str}: SUCCESS (consumed {mins} min) → streak={streak}{marker}")
    else:
        if streak > 0:
            print(f"  {date_str}: FAIL (consumed {mins} min) → streak reset (was {streak})")
        streak = 0
print(f"\nFinal streak: {streak}")
