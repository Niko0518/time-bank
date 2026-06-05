Add-Type -AssemblyName System.Globalization
$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"

"=== Test: tz detection ==="
"OS TimeZone: $([System.TimeZoneInfo]::Local.Id)"
"OS UTC Offset: $([System.TimeZoneInfo]::Local.BaseUtcOffset)"

"=== Test: Get TimeZone Asia/Shanghai by different methods ==="
try {
    $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("Asia/Shanghai")
    "Found Asia/Shanghai"
} catch {
    $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("China Standard Time")
    "Found by China Standard Time: $($tz.Id)"
}

$taskTxs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp
"=== Total: $($taskTxs.Count) ==="

"=== Sample transactions (5.20-5.30) ==="
$taskTxs | Where-Object { $_.timestamp -ge "2026-05-20" -and $_.timestamp -lt "2026-05-31" } | ForEach-Object {
    $utc = [datetime]$_.timestamp
    $cst = [System.TimeZoneInfo]::ConvertTimeFromUtc($utc, $tz)
    Write-Host "  timestamp=$($_.timestamp) UTC=$($utc.ToString('yyyy-MM-dd HH:mm:ss')) CST=$($cst.ToString('yyyy-MM-dd HH:mm:ss')) amount=$($_.amount)"
}
