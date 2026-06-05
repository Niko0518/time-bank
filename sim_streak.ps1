Add-Type -AssemblyName System.Globalization
$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"
$tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("Asia/Shanghai")
$taskTxs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp

"=== rebuildHabitStreak 复现 (Asia/Shanghai) ==="

$periods = @{}
foreach ($tx in $taskTxs) {
    $ts = $tx.timestamp
    if (-not $ts) { continue }
    try {
        $utc = [datetime]$ts
        $cst = [System.TimeZoneInfo]::ConvertTimeFromUtc($utc, $tz)
        $key = $cst.ToString("yyyy-MM-dd")
    } catch {
        $key = $ts.Substring(0,10)
        $cst = [datetime]$ts
    }
    if (-not $periods.ContainsKey($key)) {
        $periods[$key] = @{ count = 0; firstTxDate = $cst; isQualified = $false }
    }
    $periods[$key].count++
}

$targetCount = 1
foreach ($k in $periods.Keys.Clone()) {
    $periods[$k].isQualified = ($periods[$k].count -ge $targetCount)
}

"=== 5.20 后的所有周期 ==="
$newStreak = 0
$lastStr = $null
$recent = $periods.Keys | Where-Object { $_ -ge "2026-05-20" } | Sort-Object
foreach ($k in $recent) {
    $pd = $periods[$k]
    if (-not $pd.isQualified) {
        $newStreak = 0
        $lastStr = $null
        Write-Host "$k NOT_QUALIFIED streak=0"
        continue
    }
    $cur = $pd.firstTxDate.Date
    if ($null -eq $lastStr) {
        $newStreak = 1
    } else {
        $parts = $lastStr.Split('-') | ForEach-Object { [int]$_ }
        $last = Get-Date -Year $parts[0] -Month $parts[1] -Day $parts[2]
        $diff = ($cur - $last).Days
        if ($diff -eq 1) { $newStreak++ } else { $newStreak = 1 }
    }
    $lastStr = $k
    Write-Host "$k count=$($pd.count) streak=$newStreak"
}
""
Write-Host "=== 最终 streak = $newStreak (预期应该=15) ==="
