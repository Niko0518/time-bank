Set-Location 'D:\TimeBank\android_project\app\src\main\assets\www\js'
$files = @('app-1.js','app-2.js','app-reports.js','app-auth.js','app-systems.js','app-sleep.js','ai-service.js')
$bad = 0
foreach ($f in $files) {
    $out = node --check $f 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERR] $f"
        Write-Host $out
        $bad++
    } else {
        Write-Host "[OK] $f"
    }
}
Write-Host "==== $bad errors ===="
