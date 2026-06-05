Add-Type -AssemblyName System.Globalization
$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"
$tz = [System.TimeZoneInfo]::FindSystemTimeZoneById("China Standard Time")
$txs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp

"=== 关键交易 6.2-6.4 ==="
$txs | Where-Object { $_.timestamp -ge "2026-06-02" -and $_.timestamp -lt "2026-06-04T16:00" } | ForEach-Object {
    $utc = [datetime]::SpecifyKind([datetime]$_.timestamp, [System.DateTimeKind]::Utc)
    $cst = [System.TimeZoneInfo]::ConvertTimeFromUtc($utc, $tz)
    Write-Host "UTC=$($_.timestamp)  CST=$($cst.ToString('MM-dd HH:mm'))  amount=$($_.amount)  isBackdate=$($_.isBackdate)  clientId=$($_.clientId.Substring(0,30))...  desc=$($_.description)"
}
