# 精确模拟：考虑利息对后续余额的复利效应
# 这与实际系统的行为一致
$json = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-05-21.json" -Raw | ConvertFrom-Json
$transactions = $json.transactions

function Get-ShanghaiDateString($isoTimestamp) {
    $ts = [DateTime]::Parse($isoTimestamp)
    $localTs = $ts.AddHours(8)
    return $localTs.ToString("yyyy-MM-dd")
}

# 1. 获取所有利息交易，按日期排序
$interestTxs = $transactions | Where-Object {
    $_.systemType -eq 'interest' -or $_.systemType -eq 'interest-adjust'
} | Sort-Object { $_.interestData.date }

# 2. 计算每日的"非利息净变化"（即除利息外的所有交易）
$dailyNonInterestNet = @{}
foreach ($tx in $transactions) {
    if ($tx.undone) { continue }
    if ($tx.systemType -eq 'interest' -or $tx.systemType -eq 'interest-adjust') { continue }
    $tDate = Get-ShanghaiDateString $tx.timestamp
    $effect = if ($tx.type -eq 'earn') { $tx.amount } else { -$tx.amount }
    if (-not $dailyNonInterestNet.ContainsKey($tDate)) { $dailyNonInterestNet[$tDate] = 0 }
    $dailyNonInterestNet[$tDate] += $effect
}

# 3. 获取利率映射
$rateByDate = @{}
foreach ($tx in $interestTxs) {
    $rateByDate[$tx.interestData.date] = $tx.interestData.rate
}

# 4. 模拟A：旧系统行为（使用错误的baseBalance，但利息确实影响后续余额）
# 这个模拟比较复杂，因为我们不知道旧系统每天具体用了什么余额
# 但我们知道旧利息交易的金额，可以直接用

# 5. 模拟B：新系统行为（使用正确的余额，利息影响后续余额）
# 从金融系统开启日（3月9日）开始逐日模拟
$allDates = $dailyNonInterestNet.Keys | Sort-Object
$firstInterestDate = ($interestTxs | Select-Object -First 1).interestData.date

Write-Host "=== 精确复利模拟 ===" -ForegroundColor Cyan
Write-Host "金融系统开启日: $firstInterestDate"
Write-Host ""

# 找到3月9日之前一天的余额（即金融系统开启前的余额）
$balanceBeforeInterest = 0
foreach ($date in $allDates) {
    if ($date -ge $firstInterestDate) { break }
    $balanceBeforeInterest += $dailyNonInterestNet[$date]
}
Write-Host "开启前余额 (到 $firstInterestDate 前一天): $balanceBeforeInterest"
Write-Host ""

# 逐日模拟（考虑复利）
$simulatedBalance = $balanceBeforeInterest
$simulatedInterestTotal = 0
$oldInterestTotal = 0

Write-Host "日期       | 起始余额 | 非利息变化 | 正确利息 | 利率 | 日终余额(新) | 旧利息 | 旧日终余额 | 当日差额"
Write-Host "----------|----------|-----------|---------|------|-------------|--------|-----------|--------"

# 收集所有相关日期
$relevantDates = @()
foreach ($date in $allDates) {
    if ($date -ge $firstInterestDate) { $relevantDates += $date }
}
# 确保包含所有有利息的日期
foreach ($tx in $interestTxs) {
    if ($tx.interestData.date -notin $relevantDates) {
        $relevantDates += $tx.interestData.date
    }
}
$relevantDates = $relevantDates | Sort-Object | Select-Object -Unique

$cumulativeDiff = 0
$oldBalance = $balanceBeforeInterest

foreach ($date in $relevantDates) {
    $nonInterestChange = $dailyNonInterestNet[$date]
    if ($nonInterestChange -eq $null) { $nonInterestChange = 0 }

    # 查找该日期的旧利息交易
    $oldInterestTx = $interestTxs | Where-Object { $_.interestData.date -eq $date } | Select-Object -First 1
    $oldInterest = 0
    $oldRate = 0
    if ($oldInterestTx) {
        $oldInterest = if ($oldInterestTx.type -eq 'earn') { $oldInterestTx.amount } else { -$oldInterestTx.amount }
        $oldRate = $oldInterestTx.interestData.rate
    }

    # 计算正确利息（基于当日起始余额）
    $rate = if ($rateByDate.ContainsKey($date)) { $rateByDate[$date] } else { 0 }
    $correctInterest = 0
    if ($simulatedBalance -gt 0 -and $rate -gt 0) {
        $correctInterest = [Math]::Round($simulatedBalance * ($rate / 100))
    } elseif ($simulatedBalance -lt 0 -and $rate -gt 0) {
        $correctInterest = -[Math]::Round([Math]::Abs($simulatedBalance) * ($rate / 100))
    }

    # 新系统日终余额
    $newEndBalance = $simulatedBalance + $nonInterestChange + $correctInterest

    # 旧系统日终余额（使用已知的旧利息）
    $oldEndBalance = $oldBalance + $nonInterestChange + $oldInterest

    # 当日差额 = 新日终 - 旧日终
    $dayDiff = $newEndBalance - $oldEndBalance
    $cumulativeDiff += $dayDiff

    $color = if ([Math]::Abs($dayDiff) -gt 100) { "Red" } else { "White" }
    Write-Host "$date | $simulatedBalance | $nonInterestChange | $correctInterest | $rate% | $newEndBalance | $oldInterest | $oldEndBalance | $dayDiff" -ForegroundColor $color

    # 更新余额用于下一天
    $simulatedBalance = $newEndBalance
    $oldBalance = $oldEndBalance
    $simulatedInterestTotal += $correctInterest
    $oldInterestTotal += $oldInterest
}

Write-Host ""
Write-Host "=== 精确汇总 ===" -ForegroundColor Cyan
Write-Host "旧利息净额: $oldInterestTotal 秒"
Write-Host "新利息净额: $simulatedInterestTotal 秒"
Write-Host ""
Write-Host "最终余额差异（新 - 旧）: $cumulativeDiff 秒"
Write-Host "约 $([Math]::Round($cumulativeDiff/3600, 2)) 小时"
Write-Host ""
if ($cumulativeDiff -gt 0) {
    Write-Host "结论: 修复后余额将增加 $cumulativeDiff 秒（约 $([Math]::Round($cumulativeDiff/3600, 2)) 小时）" -ForegroundColor Green
} elseif ($cumulativeDiff -lt 0) {
    Write-Host "结论: 修复后余额将减少 $([Math]::Abs($cumulativeDiff)) 秒（约 $([Math]::Round([Math]::Abs($cumulativeDiff)/3600, 2)) 小时）" -ForegroundColor Red
} else {
    Write-Host "结论: 余额无变化" -ForegroundColor White
}
