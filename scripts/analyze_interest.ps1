# 分析备份数据中的利息计算问题
$json = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-05-21.json" -Raw | ConvertFrom-Json

$transactions = $json.transactions

# 获取所有利息交易
$interestTxs = $transactions | Where-Object { $_.systemType -eq 'interest' -or $_.systemType -eq 'interest-adjust' } | Sort-Object timestamp

Write-Host "=== 利息交易记录 ===" -ForegroundColor Cyan
foreach ($tx in $interestTxs) {
    $date = $tx.interestData.date
    $baseBalance = $tx.interestData.baseBalance
    $rate = $tx.interestData.rate
    $amount = $tx.amount
    $desc = $tx.description
    Write-Host "$date | baseBalance: $baseBalance | rate: $rate% | amount: $amount | $desc"
}

Write-Host ""
Write-Host "=== 验证利息计算 ===" -ForegroundColor Cyan
foreach ($tx in $interestTxs) {
    $baseBalance = $tx.interestData.baseBalance
    $rate = $tx.interestData.rate
    $expected = [Math]::Round([Math]::Abs($baseBalance) * ($rate / 100))
    $actual = $tx.amount
    $status = if ($expected -eq $actual) { "OK" } else { "MISMATCH expected=$expected" }
    Write-Host "$($tx.interestData.date) | calc: |$baseBalance| * $rate% = $expected | actual: $actual | $status"
}

Write-Host ""
Write-Host "=== 按日期累加计算实际余额（验证baseBalance） ===" -ForegroundColor Cyan

# 按日期分组计算每日净变化
$dailyNet = @{}
foreach ($tx in $transactions) {
    if ($tx.undone) { continue }
    # 解析ISO时间戳，手动加8小时转为东八区
    $ts = [DateTime]::Parse($tx.timestamp)
    $localTs = $ts.AddHours(8)
    $dateStr = $localTs.ToString("yyyy-MM-dd")

    $effect = if ($tx.type -eq 'earn') { $tx.amount } else { -$tx.amount }

    if (-not $dailyNet.ContainsKey($dateStr)) {
        $dailyNet[$dateStr] = 0
    }
    $dailyNet[$dateStr] += $effect
}

# 按日期排序并计算累积余额
$sortedDates = $dailyNet.Keys | Sort-Object
$cumulative = 0
Write-Host "date       | dailyNet  | endBalance | interestBase | diff"
Write-Host "----------|----------|------------|--------------|------"
foreach ($date in $sortedDates) {
    $net = $dailyNet[$date]
    $cumulative += $net

    $interestTx = $interestTxs | Where-Object { $_.interestData.date -eq $date }
    $interestBase = if ($interestTx) { $interestTx.interestData.baseBalance } else { $null }
    $diff = if ($interestBase -ne $null) { $cumulative - $interestBase } else { $null }

    $interestStr = if ($interestBase -ne $null) { "$interestBase" } else { "" }
    $diffStr = if ($diff -ne $null) { "$diff" } else { "" }

    Write-Host "$date | $net | $cumulative | $interestStr | $diffStr"
}
