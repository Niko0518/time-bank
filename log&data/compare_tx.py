import json

with open('timebank_backup_2026-02-07 (-43小时).json', 'r', encoding='utf-8') as f:
    data1 = json.load(f)
with open('timebank_backup_2026-02-07 (-46小时).json', 'r', encoding='utf-8') as f:
    data2 = json.load(f)

tx1 = {t['id']: t for t in data1.get('transactions', [])}
tx2 = {t['id']: t for t in data2.get('transactions', [])}

print(f"-43小时: {len(tx1)} 条交易, 余额: {data1['currentBalance']}")
print(f"-46小时: {len(tx2)} 条交易, 余额: {data2['currentBalance']}")
print(f"余额差: {data2['currentBalance'] - data1['currentBalance']} 秒")

# 找出差异
only_in_1 = set(tx1.keys()) - set(tx2.keys())
only_in_2 = set(tx2.keys()) - set(tx1.keys())

print(f"\n仅在-43小时文件中的交易: {len(only_in_1)} 条")
for tid in list(only_in_1)[:5]:
    t = tx1[tid]
    print(f"  {t['timestamp']}: {t['amount']:+d} - {t.get('taskName', 'N/A')[:30]}")

print(f"\n仅在-46小时文件中的交易: {len(only_in_2)} 条")
for tid in list(only_in_2)[:5]:
    t = tx2[tid]
    print(f"  {t['timestamp']}: {t['amount']:+d} - {t.get('taskName', 'N/A')[:30]}")

# 计算差异总额
diff_sum = sum(tx1[tid]['amount'] for tid in only_in_1) - sum(tx2[tid]['amount'] for tid in only_in_2)
print(f"\n差异交易总额: {diff_sum} 秒 = {diff_sum/3600:.2f} 小时")
