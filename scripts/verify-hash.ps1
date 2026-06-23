$files = @('index.html','sw.js','manifest.json','css\main.css','js\app-1.js','js\app-2.js','js\app-reports.js','js\app-sleep.js','js\app-systems.js','js\app-auth.js','js\ai-service.js')
$ok = $true
foreach ($f in $files) {
    $src = "android_project\app\src\main\assets\www\$f"
    if (Test-Path $f -PathType Leaf) {
        $a = (Get-FileHash $src -Algorithm SHA256).Hash
        $b = (Get-FileHash $f -Algorithm SHA256).Hash
        $match = if ($a -eq $b) { 'OK' } else { 'MISMATCH'; $ok = $false }
        Write-Host ("{0,-25} {1,-8} src={2}  dst={3}" -f $f, $match, $a.Substring(0,12), $b.Substring(0,12))
    } else {
        Write-Host ("{0,-25} MISSING-AT-ROOT" -f $f)
        $ok = $false
    }
}
if ($ok) { Write-Host 'ALL-HASH-OK' } else { Write-Host 'HASH-FAIL' }
