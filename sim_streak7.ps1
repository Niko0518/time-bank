Add-Type -AssemblyName System.Globalization
$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"
$tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("China Standard Time")
$txs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp

"=== Step 1: 按 CST 周期分组 ==="
$periods = [ordered]@{}
foreach ($tx in $txs) {
    $utc = [datetime]::SpecifyKind([datetime]$tx.timestamp, [System.DateTimeKind]::Utc)
    $cst = [System.TimeZoneInfo]::ConvertTimeFromUtc($utc, $tz)
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

"=== Step 2: 计算 streak ==="
$newStreak = 0
$lastCompletionDateStr = $null
foreach ($k in @($periods.Keys)) {
    $pd = $periods[$k]
    if (-not $pd.isQualified) {
        $newStreak = 0
        $lastCompletionDateStr = $null
        Write-Host "$k NOT_QUALIFIED -> streak=0"
        continue
    }
    $cur = $pd.firstTxDate.Date  # setHours(0,0,0,0) in JS
    if ($null -eq $lastCompletionDateStr) {
        $newStreak = 1
    } else {
        $parts = $lastCompletionDateStr.Split('-') | ForEach-Object { [int]$_ }
        $last = Get-Date -Year $parts[0] -Month $parts[1] -Day $parts[2]
        $diff = ($cur - $last).Days
        if ($diff -eq 1) {
            $newStreak++
        } else {
            $newStreak = 1
        }
    }
    $lastCompletionDateStr = $k
    Write-Host "$k count=$($pd.count) streak=$newStreak"
}
""
Write-Host "=== 最终 streak = $newStreak ==="
Write-Host "=== backup streak = 1 ==="
