$data = Get-Content "d:\TimeBank\log&data\待修复数据\timebank_backup_2026-06-04 (1).json" -Raw -Encoding UTF8 | ConvertFrom-Json
$taskId = "1762064261306"
$txs = $data.transactions | Where-Object { $_.taskId -eq $taskId -and $_.type -eq 'earn' -and -not $_.undone } | Sort-Object timestamp

"=== 5.15-6.4 详细 ==="
$txs | Where-Object { $_.timestamp -ge "2026-05-15" -and $_.timestamp -lt "2026-06-05" } | ForEach-Object {
    Write-Host "ts=$($_.timestamp) (idx=$($txs.IndexOf($_)))"
}

"=== 5.20 索引 ==="
$idx520 = $txs | Where-Object { $_.timestamp -ge "2026-05-19" -and $_.timestamp -lt "2026-05-21" }
"count: $($idx520.Count)"
$idx520 | ForEach-Object { Write-Host "  $($_.timestamp)" }

"=== 5.20 CST 解释 ==="
foreach ($tx in $idx520) {
    $utc = [datetime]::Parse($tx.timestamp)
    Add-Type -AssemblyName System.Globalization -ErrorAction SilentlyContinue
    Write-Host "  raw=$($_.timestamp) UTC=$($utc.ToString('yyyy-MM-dd HH:mm:ssZ'))"
}
