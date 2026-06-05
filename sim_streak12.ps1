$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"
$txs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp

$periods = [ordered]@{}
foreach ($tx in $txs) {
    $cst = [datetime]$tx.timestamp
    $year = $cst.Year; $month = $cst.Month; $day = $cst.Day
    $periodStart = Get-Date -Year $year -Month $month -Day $day -Hour 0 -Minute 0 -Second 0
    $periodKey = $periodStart.ToString("yyyy-MM-dd")
    if (-not $periods.Contains($periodKey)) {
        $periods[$periodKey] = [pscustomobject]@{ count = 0; firstTxDate = $cst; isQualified = $false }
    }
    $periods[$periodKey].count++
}
$targetCount = 1
foreach ($k in @($periods.Keys)) { $periods[$k].isQualified = ($periods[$k].count -ge $targetCount) }

$newStreak = 0
$lastCompletionDateStr = $null
$recent = $periods.Keys | Where-Object { $_ -ge "2026-05-15" } | Sort-Object
foreach ($k in $recent) {
    $pd = $periods[$k]
    if (-not $pd.isQualified) { $newStreak = 0; $lastCompletionDateStr = $null; continue }
    $cur = $pd.firstTxDate.Date
    if ($null -eq $lastCompletionDateStr) {
        $newStreak = 1
    } else {
        $parts = $lastCompletionDateStr.Split('-') | ForEach-Object { [int]$_ }
        $last = Get-Date -Year $parts[0] -Month $parts[1] -Day $parts[2] -Hour 0 -Minute 0 -Second 0
        $diff = [int]([math]::Floor(($cur - $last).TotalDays))
        Write-Host "$k cur=$($cur.ToString('o')) kind=$($cur.Kind) last=$($last.ToString('o')) kind=$($last.Kind) diff=$diff old_streak=$newStreak"
        if ($diff -eq 1) { $newStreak++ } else { $newStreak = 1 }
    }
    $lastCompletionDateStr = $k
}
""
Write-Host "=== 最终 = $newStreak ==="
