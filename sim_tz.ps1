$ts = [datetime]"2026-05-21T04:00:00.000Z"
Write-Host "Kind: $($ts.Kind)"
Write-Host "ToString: $($ts.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "AddHours(8): $($ts.AddHours(8).ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "Y/M/D: $($ts.Year)-$($ts.Month)-$($ts.Day)"

# 测 sandbox timezone
Write-Host "Now UTC: $([datetime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "Now Local: $([datetime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "TimeZone: $([System.TimeZoneInfo]::Local.Id) Offset: $([System.TimeZoneInfo]::Local.BaseUtcOffset)"

# 测 CST
try {
    $cst = [System.TimeZoneInfo]::FindSystemTimeZoneById("Asia/Shanghai")
    Write-Host "Asia/Shanghai: $($cst.BaseUtcOffset)"
} catch {
    Write-Host "Asia/Shanghai not found"
}
try {
    $cst = [System.TimeZoneInfo]::FindSystemTimeZoneById("China Standard Time")
    Write-Host "China Standard Time: $($cst.BaseUtcOffset)"
} catch {
    Write-Host "China Standard Time not found"
}

# 5.20 测试
$ts520 = [datetime]"2026-05-20T04:00:00.000Z"
Write-Host "5.20 +8: $($ts520.AddHours(8).ToString('yyyy-MM-dd'))"
