$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"
# 模拟 JS 客户端 Asia/Shanghai
$txs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp

"=== 模拟 JS 客户端的 rebuildHabitStreak (CST +8) ==="
"输入: $($txs.Count) 笔 earn 交易"

# JS: new Date(tx.timestamp) - 内部绝对时间戳
# JS: txDate.getFullYear/Month/Date - 本地时区字段
# 模拟 CST: UTC + 8 hours
function GetCstDate([datetime]$utcTs) {
    return $utcTs.AddHours(8)
}

# Step 1: 分组到周期
$periods = [ordered]@{}
foreach ($tx in $txs) {
    $utc = [datetime]$tx.timestamp
    $cst = GetCstDate $utc
    # JS: new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate())
    $year = $cst.Year
    $month = $cst.Month
    $day = $cst.Day
    $periodStart = Get-Date -Year $year -Month $month -Day $day -Hour 0 -Minute 0 -Second 0
    $periodKey = $periodStart.ToString("yyyy-MM-dd")
    if (-not $periods.Contains($periodKey)) {
        $periods[$periodKey] = [pscustomobject]@{ count = 0; firstTxDate = $cst; isQualified = $false }
    }
    $periods[$periodKey].count++
}

$targetCount = 1
foreach ($k in @($periods.Keys)) {
    $periods[$k].isQualified = ($periods[$k].count -ge $targetCount)
}

"=== 5.15-6.4 周期 (只显示 recent) ==="
$newStreak = 0
$lastCompletionDateStr = $null
$recent = $periods.Keys | Where-Object { $_ -ge "2026-05-15" } | Sort-Object
foreach ($k in $recent) {
    $pd = $periods[$k]
    if (-not $pd.isQualified) {
        $newStreak = 0
        $lastCompletionDateStr = $null
        Write-Host "$k NOT_QUALIFIED -> streak=0"
        continue
    }
    $cur = $pd.firstTxDate.Date  # setHours(0,0,0,0)
    if ($null -eq $lastCompletionDateStr) {
        $newStreak = 1
    } else {
        $parts = $lastCompletionDateStr.Split('-') | ForEach-Object { [int]$_ }
        $last = Get-Date -Year $parts[0] -Month $parts[1] -Day $parts[2]
        $diff = ($cur - $last).Days
        if ($diff -eq 1) { $newStreak++ } else { $newStreak = 1 }
    }
    $lastCompletionDateStr = $k
    Write-Host "$k count=$($pd.count) streak=$newStreak"
}
""
Write-Host "=== 最终 streak = $newStreak ==="
Write-Host "=== backup streak = 1 ==="
