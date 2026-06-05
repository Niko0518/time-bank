Add-Type -AssemblyName System.Globalization
$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"
$tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("China Standard Time")
$taskTxs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp

"=== rebuildHabitStreak 复现 (CST +8) ==="

$periods = [ordered]@{}
foreach ($tx in $taskTxs) {
    $utc = [datetime]::SpecifyKind([datetime]$tx.timestamp, [System.DateTimeKind]::Utc)
    $cst = [System.TimeZoneInfo]::ConvertTimeFromUtc($utc, $tz)
    $key = $cst.ToString("yyyy-MM-dd")
    if (-not $periods.Contains($key)) {
        $periods[$key] = [pscustomobject]@{ count = 0; firstCst = $cst; isQualified = $false }
    }
    $periods[$key].count++
}

$targetCount = 1
foreach ($k in @($periods.Keys)) {
    $periods[$k].isQualified = ($periods[$k].count -ge $targetCount)
}

"=== 5.20 后的所有周期 ==="
$newStreak = 0
$lastDate = $null
foreach ($k in @($periods.Keys)) {
    if ($k -lt "2026-05-20") { continue }
    $pd = $periods[$k]
    if (-not $pd.isQualified) {
        $newStreak = 0
        $lastDate = $null
        Write-Host "$k NOT_QUALIFIED count=$($pd.count) streak=0"
        continue
    }
    $cur = $pd.firstCst.Date
    if ($null -eq $lastDate) {
        $newStreak = 1
    } else {
        $diff = ($cur - $lastDate).Days
        Write-Host "  DEBUG: $k cur=$cur last=$lastDate diff=$diff"
        if ($diff -eq 1) { $newStreak++ } else { $newStreak = 1 }
    }
    $lastDate = $cur
    Write-Host "$k count=$($pd.count) streak=$newStreak"
}
""
Write-Host "=== 最终 streak = $newStreak ==="
