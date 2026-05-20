# 分析3月初的交易，查找baseBalance错误的根源
$json = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-05-21.json" -Raw | ConvertFrom-Json
$transactions = $json.transactions

function Get-ShanghaiDateString($isoTimestamp) {
    $ts = [DateTime]::Parse($isoTimestamp)
    $localTs = $ts.AddHours(8)
    return $localTs.ToString("yyyy-MM-dd")
}

# 计算每日结束余额（精确模拟）
$dailyNet = @{}
foreach ($tx in $transactions) {
    if ($tx.undone) { continue }
    $tDate = Get-ShanghaiDateString $tx.timestamp
    $effect = if ($tx.type -eq 'earn') { $tx.amount } else { -$tx.amount }
    if (-not $dailyNet.ContainsKey($tDate)) { $dailyNet[$tDate] = 0 }
    $dailyNet[$tDate] += $effect
}

$sortedDates = $dailyNet.Keys | Sort-Object
$cumulative = 0

Write-Host "=== 3月每日余额与利息对比 ===" -ForegroundColor Cyan
foreach ($date in $sortedDates) {
    if ($date -lt "2026-03-01" -or $date -gt "2026-03-31") { continue }
    $net = $dailyNet[$date]
    $cumulative += $net

    $interestTx = $transactions | Where-Object {
        ($_.systemType -eq 'interest' -or $_.systemType -eq 'interest-adjust') -and
        $_.interestData.date -eq $date
    } | Select-Object -First 1

    $base = if ($interestTx) { $interestTx.interestData.baseBalance } else { $null }
    $diff = if ($base -ne $null) { $cumulative - $base } else { $null }

    $color = if ($diff -ne $null -and [Math]::Abs($diff) -gt 1000) { "Red" } else { "White" }
    Write-Host "$date | endBalance=$cumulative | baseBalance=$base | diff=$diff" -ForegroundColor $color
}

Write-Host ""
Write-Host "=== 4月每日余额与利息对比 ===" -ForegroundColor Cyan
$cumulative = 0
foreach ($date in $sortedDates) {
    if ($date -lt "2026-04-01" -or $date -gt "2026-04-30") { continue }
    $net = $dailyNet[$date]
    $cumulative += $net

    $interestTx = $transactions | Where-Object {
        ($_.systemType -eq 'interest' -or $_.systemType -eq 'interest-adjust') -and
        $_.interestData.date -eq $date
    } | Select-Object -First 1

    $base = if ($interestTx) { $interestTx.interestData.baseBalance } else { $null }
    $diff = if ($base -ne $null) { $cumulative - $base } else { $null }

    $color = if ($diff -ne $null -and [Math]::Abs($diff) -gt 1000) { "Red" } else { "White" }
    Write-Host "$date | endBalance=$cumulative | baseBalance=$base | diff=$diff" -ForegroundColor $color
}

Write-Host ""
Write-Host "=== 查找3月8日-9日附近的异常交易 ===" -ForegroundColor Cyan
foreach ($tx in $transactions) {
    $tDate = Get-ShanghaiDateString $tx.timestamp
    if ($tDate -eq "2026-03-08" -or $tDate -eq "2026-03-09" -or $tDate -eq "2026-03-10") {
        $type = $tx.type
        $amt = $tx.amount
        $name = $tx.taskName
        $ts = $tx.timestamp
        Write-Host "$tDate | $type | $amt | $name | $ts"
    }
}
