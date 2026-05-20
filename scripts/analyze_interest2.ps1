# 精确模拟 settleDailyInterest 的余额计算逻辑
$json = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-05-21.json" -Raw | ConvertFrom-Json
$transactions = $json.transactions

# 模拟 getLocalDateString (东八区)
function Get-ShanghaiDateString($isoTimestamp) {
    $ts = [DateTime]::Parse($isoTimestamp)
    $localTs = $ts.AddHours(8)
    return $localTs.ToString("yyyy-MM-dd")
}

# 获取所有利息交易
$interestTxs = $transactions | Where-Object { $_.systemType -eq 'interest' -or $_.systemType -eq 'interest-adjust' } | Sort-Object timestamp

Write-Host "=== 模拟 settleDailyInterest 余额计算 ===" -ForegroundColor Cyan

# 对每一天计算昨日结束余额
$dates = @("2026-05-17", "2026-05-18", "2026-05-19", "2026-05-20")

foreach ($yesterdayStr in $dates) {
    Write-Host ""
    Write-Host "--- 计算 $yesterdayStr 的日终余额 ---" -ForegroundColor Yellow

    # 模拟代码逻辑：第一个循环（非利息交易）
    $balance1 = 0
    foreach ($t in $transactions) {
        if ($t.undone) { continue }
        if ($t.systemType -eq 'interest' -or $t.systemType -eq 'interest-adjust') { continue }
        $tDate = Get-ShanghaiDateString $t.timestamp
        if ($tDate -le $yesterdayStr) {
            $delta = if ($t.type -eq 'earn') { $t.amount } else { -$t.amount }
            $balance1 += $delta
        }
    }

    # 模拟代码逻辑：第二个循环（利息交易）
    $balance2 = 0
    foreach ($t in $transactions) {
        if ($t.undone) { continue }
        if ($t.systemType -ne 'interest' -and $t.systemType -ne 'interest-adjust') { continue }
        $tDate = Get-ShanghaiDateString $t.timestamp
        if ($tDate -le $yesterdayStr) {
            $delta = if ($t.type -eq 'earn') { $t.amount } else { -$t.amount }
            $balance2 += $delta
        }
    }

    $totalBalance = $balance1 + $balance2

    # 查找实际的利息交易
    $actualInterest = $interestTxs | Where-Object { $_.interestData.date -eq $yesterdayStr }
    $actualBase = if ($actualInterest) { $actualInterest.interestData.baseBalance } else { $null }

    Write-Host "非利息交易累计: $balance1"
    Write-Host "利息交易累计:   $balance2"
    Write-Host "计算总余额:     $totalBalance"
    if ($actualBase -ne $null) {
        Write-Host "实际baseBalance: $actualBase"
        Write-Host "差异: $($totalBalance - $actualBase)"
    }
}

Write-Host ""
Write-Host "=== 检查利息交易时间戳的日期 ===" -ForegroundColor Cyan
foreach ($tx in $interestTxs | Select-Object -Last 10) {
    $ts = $tx.timestamp
    $shDate = Get-ShanghaiDateString $ts
    $utcDate = ([DateTime]::Parse($ts)).ToString("yyyy-MM-dd")
    Write-Host "date=$($tx.interestData.date) | UTCdate=$utcDate | SHdate=$shDate | timestamp=$ts | baseBalance=$($tx.interestData.baseBalance)"
}
