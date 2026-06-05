$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"
$txs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp

"=== 关键交易详细 ==="
$txs | Where-Object { $_.timestamp -ge "2026-06-02T20:00" -and $_.timestamp -lt "2026-06-04T20:00" } | ForEach-Object {
    $ts = [datetime]$_.timestamp
    $cst = $ts.AddHours(8)  # UTC+8
    Write-Host "timestamp=$($_.timestamp)  CST=$($cst.ToString('yyyy-MM-dd HH:mm'))  amount=$($_.amount)  id=$($_.id)  isBackdate=$($_.isBackdate)  desc=$($_.description)"
}
