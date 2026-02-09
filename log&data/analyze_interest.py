import json
from datetime import datetime

with open('错误数据/timebank_backup_2026-02-09.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

txs = data.get('transactions', [])

# Find all interest transactions
interest_txs = [t for t in txs if t.get('systemType') in ('interest', 'interest-adjust') or '利息' in t.get('taskName', '')]

print(f"Total interest transactions: {len(interest_txs)}")
print("=" * 120)

for t in sorted(interest_txs, key=lambda x: x.get('timestamp', 0) if isinstance(x.get('timestamp', 0), (int, float)) else 0):
    ts = t.get('timestamp', 0)
    if isinstance(ts, str):
        # ISO string
        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
    elif ts > 1e10:
        dt = datetime.fromtimestamp(ts/1000)
    else:
        dt = datetime.fromtimestamp(ts)
    tid = t.get('id', '')[:24]
    name = t.get('taskName', '')
    ttype = t.get('type', '')
    amount = t.get('amount', 0)
    desc = t.get('description', '')[:80]
    sys_type = t.get('systemType', '')
    print(f"{dt} | {name:20s} | {ttype:5s} | {amount:>10.1f}s ({amount/60:.1f}min) | {sys_type:16s} | {tid}")
    print(f"  desc: {desc}")
    print()

# Check for duplicate dates
print("\n=== Interest by date ===")
date_groups = {}
def parse_ts(ts):
    if isinstance(ts, str):
        return datetime.fromisoformat(ts.replace('Z', '+00:00'))
    elif ts > 1e10:
        return datetime.fromtimestamp(ts/1000)
    else:
        return datetime.fromtimestamp(ts)

for t in interest_txs:
    ts = t.get('timestamp', 0)
    dt = parse_ts(ts)
    date_str = dt.strftime('%Y-%m-%d')
    if date_str not in date_groups:
        date_groups[date_str] = []
    date_groups[date_str].append(t)

for date_str in sorted(date_groups.keys()):
    group = date_groups[date_str]
    if len(group) > 1:
        print(f"\n⚠️  DUPLICATE: {date_str} has {len(group)} interest transactions:")
        for t in group:
            ts = t.get('timestamp', 0)
            dt = parse_ts(ts)
            print(f"  {dt} | {t.get('taskName','')} | {t.get('type','')} | {t.get('amount',0)/60:.1f}min | id={t.get('_id','N/A')[:24]}")
    else:
        t = group[0]
        print(f"✓  {date_str}: {t.get('taskName','')} | {t.get('type','')} | {t.get('amount',0)/60:.1f}min")
