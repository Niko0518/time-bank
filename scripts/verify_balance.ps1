# 验证当前余额的构成，确认利息对余额的实际影响
$json = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-05-21.json" -Raw | ConvertFrom-Json
$transactions = $json.transactions

# 1. 计算 currentBalance（所有交易累加，含利息）
$calculatedTotal = 0
$interestTotal = 0
$nonInterestTotal = 0
foreach ($tx in $transactions) {
    if ($tx.undone) { continue }
    $effect = if ($tx.type -eq 'earn') { $tx.amount } else { -$tx.amount }
    $calculatedTotal += $effect
    if ($tx.systemType -eq 'interest' -or $tx.systemType -eq 'interest-adjust') {
        $interestTotal += $effect
    } else {
        $nonInterestTotal += $effect
    }
}

Write-Host "=== 余额构成分析 ===" -ForegroundColor Cyan
Write-Host "非利息交易净额: $nonInterestTotal 秒"
Write-Host "利息交易净额:   $interestTotal 秒"
Write-Host "计算总余额:     $calculatedTotal 秒"
Write-Host ""

# 2. 如果删除所有利息交易，余额会变成多少？
$balanceWithoutInterest = $nonInterestTotal
Write-Host "如果删除所有利息后的余额: $balanceWithoutInterest 秒"
Write-Host ""

# 3. 重新计算正确的利息（从开启日逐日模拟，使用正确的余额基数）
function Get-ShanghaiDateString($isoTimestamp) {
    $ts = [DateTime]::Parse($isoTimestamp)
    $localTs = $ts.AddHours(8)
    return $localTs.ToString("yyyy-MM-dd")
}

# 每日非利息净变化
$dailyNonInterestNet = @{}
foreach ($tx in $transactions) {
    if ($tx.undone) { continue }
    if ($tx.systemType -eq 'interest' -or $tx.systemType -eq 'interest-adjust') { continue }
    $tDate = Get-ShanghaiDateString $tx.timestamp
    $effect = if ($tx.type -eq 'earn') { $tx.amount } else { -$tx.amount }
    if (-not $dailyNonInterestNet.ContainsKey($tDate)) { $dailyNonInterestNet[$tDate] = 0 }
    $dailyNonInterestNet[$tDate] += $effect
}

# 利率映射
$rateByDate = @{}
$interestTxs = $transactions | Where-Object {
    $_.systemType -eq 'interest' -or $_.systemType -eq 'interest-adjust'
}
foreach ($tx in $interestTxs) {
    $rateByDate[$tx.interestData.date] = $tx.interestData.rate
}

# 找到开启日
$allDates = $dailyNonInterestNet.Keys | Sort-Object
$firstInterestDate = ($interestTxs | Sort-Object { $_.interestData.date } | Select-Object -First 1).interestData.date

# 开启前余额
$balanceBefore = 0
foreach ($date in $allDates) {
    if ($date -ge $firstInterestDate) { break }
    $balanceBefore += $dailyNonInterestNet[$date]
}

# 逐日模拟正确利息
$simBalance = $balanceBefore
$correctInterestTotal = 0
$relevantDates = $allDates | Where-Object { $_ -ge $firstInterestDate } | Sort-Object

foreach ($date in $relevantDates) {
    $nonInterestChange = $dailyNonInterestNet[$date]
    if ($nonInterestChange -eq $null) { $nonInterestChange = 0 }

    $rate = if ($rateByDate.ContainsKey($date)) { $rateByDate[$date] } else { 0 }
    $correctInterest = 0
    if ($simBalance -gt 0 -and $rate -gt 0) {
        $correctInterest = [Math]::Round($simBalance * ($rate / 100))
    } elseif ($simBalance -lt 0 -and $rate -gt 0) {
        $correctInterest = -[Math]::Round([Math]::Abs($simBalance) * ($rate / 100))
    }

    $simBalance += $nonInterestChange + $correctInterest
    $correctInterestTotal += $correctInterest
}

Write-Host "=== 重新模拟正确利息 ===" -ForegroundColor Cyan
Write-Host "开启前余额: $balanceBefore 秒"
Write-Host "正确利息净额: $correctInterestTotal 秒"
Write-Host "正确总余额 (开启前+非利息+正确利息): $($balanceBefore + $nonInterestTotal - $balanceBefore + $correctInterestTotal) 秒"
Write-Host "即: $($nonInterestTotal + $correctInterestTotal) 秒"
Write-Host ""
Write-Host "当前实际余额: $calculatedTotal 秒"
Write-Host "正确余额应为: $($nonInterestTotal + $correctInterestTotal) 秒"
Write-Host ""

$diff = ($nonInterestTotal + $correctInterestTotal) - $calculatedTotal
Write-Host "差额: $diff 秒"
Write-Host "约 $([Math]::Round($diff/3600, 2)) 小时"
Write-Host ""
if ($diff -gt 0) {
    Write-Host "结论: 修复后余额将增加 $diff 秒" -ForegroundColor Green
} elseif ($diff -lt 0) {
    Write-Host "结论: 修复后余额将减少 $([Math]::Abs($diff)) 秒" -ForegroundColor Red
}
