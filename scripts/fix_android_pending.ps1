$f = 'd:\TimeBank\android_project\app\src\main\assets\www\js\app-1.js'
$c = [System.IO.File]::ReadAllText($f)

# 1. Replace recentLocalTransactions block with new comment
$old1 = @"
const recentLocalTransactions = new Map();
const RECENT_TX_EXPIRY_MS = 30000; // 30秒内认为是本地写入的

// [v7.38.0] pendingRegistry：精确判断某交易是否为本机发起的待确认写入
// 替代基于时间窗口的 recentLocalTransactions，从概率性判断变为确定性状态判断
let pendingRegistry = new Map(); // Map<txId, tx>
"@

$new1 = @"
// [v7.40.0] pendingRegistry：精确判断本机写入是否已收到 Watch 回声
// 结构：Map<txId, { tx, addedAt }>，addedAt 用于超时清理
let pendingRegistry = new Map(); // Map<txId, { tx, addedAt }>
"@

$c = $c.Replace($old1, $new1)

# 2. Update addPending to use new structure
$c = $c.Replace('pendingRegistry.set(tx.id, tx);', 'pendingRegistry.set(tx.id, { tx, addedAt: Date.now() });')

# 3. Update savePendingRegistry
$c = $c.Replace('pendingRegistry.forEach((tx, id) => arr.push({ id, tx }));', 'pendingRegistry.forEach((entry, id) => arr.push({ id, tx: entry.tx, addedAt: entry.addedAt }));')

# 4. Update loadPendingRegistry
$old4 = @"
        arr.forEach(({ id, tx }) => pendingRegistry.set(id, tx));
"@
$new4 = @"
        arr.forEach(({ id, tx, addedAt }) => {
            pendingRegistry.set(id, { tx, addedAt: addedAt || Date.now() });
        });
"@
$c = $c.Replace($old4, $new4)

# 5. Insert cleanExpiredPending before WATCH_RECONNECT constants
$old5 = @"
// [v7.24.1] Watch 重连与补偿同步节流参数
const WATCH_RECONNECT_MIN_INTERVAL = 10000;
"@

$new5 = @"
// [v7.40.0] 清理过期 pending 条目（默认 5 分钟超时）
function cleanExpiredPending(timeoutMs = 5 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;
    for (const [txId, entry] of pendingRegistry) {
        if (now - entry.addedAt > timeoutMs) {
            pendingRegistry.delete(txId);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log('[cleanExpiredPending] 清理了 ' + cleaned + ' 条过期 pending');
        savePendingRegistry();
    }
    return cleaned;
}

// [v7.24.1] Watch 重连与补偿同步节流参数
const WATCH_RECONNECT_MIN_INTERVAL = 10000;
"@

$c = $c.Replace($old5, $new5)

[System.IO.File]::WriteAllText($f, $c)
Write-Host "Done"