$lines = Get-Content 'd:\TimeBank\android_project\app\src\main\assets\www\index.html' -Encoding UTF8
$balance = 0

for ($i = 0; $i -lt 545; $i++) {
    $line = $lines[$i]
    $opens = ([regex]::Matches($line, '<div ')).Count
    $closes = ([regex]::Matches($line, '</div>')).Count
    $prevBalance = $balance
    $balance += $opens - $closes
    
    if ($balance -lt 0 -or ($prevBalance -ge 0 -and $balance -lt 0)) {
        Write-Host "Line $($i+1): opens=$opens closes=$closes balance: $prevBalance -> $balance | $($line.Trim().Substring(0, [Math]::Min(80, $line.Trim().Length)))"
    }
}
