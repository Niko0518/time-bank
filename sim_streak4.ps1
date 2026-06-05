$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"
$txs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp

"=== 关键字段检查 (5.20-6.4) ==="
$txs | Where-Object { $_.timestamp -ge "2026-05-20" } | ForEach-Object {
    $utc = [datetime]$_.timestamp
    $hasId = [bool]$_.id
    $hasType = $_.type -eq 'earn'
    $hasAmt = $_.amount -gt 0
    $hasClientId = [bool]$_.clientId
    $streak = if ($_.isStreakAdvancement -eq $true) { "✓streak" } else { "" }
    Write-Host "$($_.timestamp.Substring(0,10)) amount=$($_.amount) id=$($_.id) clientId=$($_.clientId) $streak"
}

"=== 7.39.4+ 关键检查: 6.3 23:57 那笔的 timestamp ==="
$last = $txs | Where-Object { $_.timestamp -ge "2026-06-03T15:00" -and $_.timestamp -lt "2026-06-03T16:30" } | Select-Object timestamp, amount, description
$last | Format-Table -AutoSize
