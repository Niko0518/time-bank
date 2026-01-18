import json

filepath = 'd:/TimeBank/doto/timebank_backup_2026-01-18_fixed.json'

with open(filepath, 'r', encoding='utf-8') as f:
    data = json.load(f)

print('修复前:')
print(f'交易数量: {len(data["transactions"])}')

# 找到刷抖音任务
for task in data['tasks']:
    if task['name'] == '刷抖音':
        print(f'streak: {task["habitDetails"]["streak"]}')
        print(f'isBroken: {task["habitDetails"]["isBroken"]}')
        
        # 修改
        task['habitDetails']['streak'] = 0
        task['habitDetails']['isBroken'] = True
        task['habitDetails']['lastSettledDate'] = '2026-01-17'
        break

# 删除错误的成功记录
original_count = len(data['transactions'])
data['transactions'] = [t for t in data['transactions'] if '戒除挑战成功: 刷抖音' not in t.get('description', '')]
deleted_count = original_count - len(data['transactions'])

print()
print('修复后:')
print(f'交易数量: {len(data["transactions"])} (删除了 {deleted_count} 条)')
for task in data['tasks']:
    if task['name'] == '刷抖音':
        print(f'streak: {task["habitDetails"]["streak"]}')
        print(f'isBroken: {task["habitDetails"]["isBroken"]}')

# 保存
with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print()
print('已保存到', filepath)
