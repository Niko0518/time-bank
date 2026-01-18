const fs = require('fs');

const filepath = 'd:/TimeBank/doto/timebank_backup_2026-01-18 (4).json';

const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

console.log('修复前:');
console.log('交易数量:', data.transactions.length);

// 找到刷抖音任务
for (const task of data.tasks) {
    if (task.name === '刷抖音') {
        console.log('刷抖音 streak:', task.habitDetails.streak);
        console.log('刷抖音 isBroken:', task.habitDetails.isBroken);
        
        // 修改
        task.habitDetails.streak = 0;
        task.habitDetails.isBroken = true;
        task.habitDetails.lastSettledDate = '2026-01-17';
        break;
    }
}

// 修复夜间护肤任务
for (const task of data.tasks) {
    if (task.name === '夜间护肤') {
        console.log('\\n夜间护肤 streak (修复前):', task.habitDetails.streak);
        console.log('夜间护肤 isBroken (修复前):', task.habitDetails.isBroken);
        console.log('夜间护肤 lastCompletionDate (修复前):', task.habitDetails.lastCompletionDate);
        
        // 修改
        task.habitDetails.streak = 16;
        task.habitDetails.isBroken = false;
        task.habitDetails.lastCompletionDate = '2026-01-17';
        
        console.log('\\n夜间护肤 streak (修复后):', task.habitDetails.streak);
        console.log('夜间护肤 isBroken (修复后):', task.habitDetails.isBroken);
        console.log('夜间护肤 lastCompletionDate (修复后):', task.habitDetails.lastCompletionDate);
        break;
    }
}

// 删除错误的成功记录
const originalCount = data.transactions.length;
data.transactions = data.transactions.filter(t => 
    !t.description || !t.description.includes('戒除挑战成功: 刷抖音')
);
const deletedCount = originalCount - data.transactions.length;

console.log();
console.log('修复后:');
console.log('交易数量:', data.transactions.length, '(删除了', deletedCount, '条)');
for (const task of data.tasks) {
    if (task.name === '刷抖音') {
        console.log('streak:', task.habitDetails.streak);
        console.log('isBroken:', task.habitDetails.isBroken);
    }
}

// 保存
fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
console.log();
console.log('已保存到', filepath);
