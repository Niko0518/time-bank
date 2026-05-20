# 模拟重新计算所有历史利息，预测余额变动
$json = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-05-21.json" -Raw | ConvertFrom-Json
$transactions = $json.transactions

function Get-ShanghaiDateString($isoTimestamp) {
    $ts = [DateTime]::Parse($isoTimestamp)
    $localTs = $ts.AddHours(8)
    return $localTs.ToString("yyyy-MM-dd")
}

# 获取所有利息交易
$interestTxs = $transactions | Where-Object {
    $_.systemType -eq 'interest' -or $_.systemType -eq 'interest-adjust'
} | Sort-Object { $_.interestData.date }

# 计算每日结束余额（不含利息交易）
$dailyNetNoInterest = @{}
foreach ($tx in $transactions) {
    if ($tx.undone) { continue }
    if ($tx.systemType -eq 'interest' -or $tx.systemType -eq 'interest-adjust') { continue }
    $tDate = Get-ShanghaiDateString $tx.timestamp
    $effect = if ($tx.type -eq 'earn') { $tx.amount } else { -$tx.amount }
    if (-not $dailyNetNoInterest.ContainsKey($tDate)) { $dailyNetNoInterest[$tDate] = 0 }
    $dailyNetNoInterest[$tDate] += $effect
}

# 按日期排序计算累计余额
$sortedDates = $dailyNetNoInterest.Keys | Sort-Object
$cumulative = 0
$endBalanceByDate = @{}
foreach ($date in $sortedDates) {
    $cumulative += $dailyNetNoInterest[$date]
    $endBalanceByDate[$date] = $cumulative
}

# 模拟重新计算利息（假设利率：3月9日-4月20日 1%，4月21日-5月17日 1%，5月18日-5月20日 2%）
# 从实际数据中提取利率
$rateByDate = @{}
foreach ($tx in $interestTxs) {
    $rateByDate[$tx.interestData.date] = $tx.interestData.rate
}

Write-Host "=== 历史利息重新计算模拟 ===" -ForegroundColor Cyan
Write-Host "日期       | 日终余额 | 旧利息 | 旧利率 | 新利息 | 新利率 | 差额 | 累计差额"
Write-Host "----------|----------|--------|--------|--------|--------|------|----------"

$totalOldInterest = 0
$totalNewInterest = 0
$cumulativeDiff = 0

foreach ($tx in $interestTxs) {
    $date = $tx.interestData.date
    $oldInterest = $tx.amount
    $oldRate = $tx.interestData.rate
    $oldBase = $tx.interestData.baseBalance
    $oldIsLoan = $tx.type -eq 'spend'

    # 新计算：基于实际日终余额
    $actualBalance = $endBalanceByDate[$date]
    if ($actualBalance -eq $null) { $actualBalance = 0 }

    # 使用旧利率重新计算
    $newRate = $oldRate
    $newInterest = 0
    if ($actualBalance -gt 0) {
        $newInterest = [Math]::Round($actualBalance * ($newRate / 100))
    } elseif ($actualBalance -lt 0) {
        $newInterest = -[Math]::Round([Math]::Abs($actualBalance) * ($newRate / 100))
    }

    $diff = $newInterest - $oldInterest
    if ($oldIsLoan) {
        # 旧利息是支出（负数影响余额），新利息也是支出
        # diff = 新支出 - 旧支出 = (-|new|) - (-|old|) = |old| - |new|
        # 如果新支出更少，diff为正（余额增加）
    }

    $totalOldInterest += $oldInterest
    $totalNewInterest += $newInterest
    $cumulativeDiff += $diff

    $color = if ([Math]::Abs($diff) -gt 100) { "Red" } else { "White" }
    Write-Host "$date | $actualBalance | $oldInterest | $oldRate% | $newInterest | $newRate% | $diff | $cumulativeDiff" -ForegroundColor $color
}

Write-Host ""
Write-Host "=== 汇总 ===" -ForegroundColor Cyan
Write-Host "旧利息总计: $totalOldInterest 秒"
Write-Host "新利息总计: $totalNewInterest 秒"
Write-Host "差额: $($totalNewInterest - $totalOldInterest) 秒"
Write-Host ""
if ($totalNewInterest -gt $totalOldInterest) {
    Write-Host "结果: 您将损失 $($totalNewInterest - $totalOldInterest) 秒（约 $([Math]::Round(($totalNewInterest - $totalOldInterest)/3600, 2)) 小时）" -ForegroundColor Red
} else {
    Write-Host "结果: 您将获得 $($totalOldInterest - $totalNewInterest) 秒（约 $([Math]::Round(($totalOldInterest - $totalNewInterest)/3600, 2)) 小时）" -ForegroundColor Green
}
