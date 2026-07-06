# 一次性版本号自检脚本（v9.17.8）
$pattern = 'v9\.17\.[0-9]|APP_VERSION|CACHE_NAME|versionCode|versionName'
Write-Host "=== 权威源 (android_project/app/src/main/assets/www) ==="
Get-ChildItem -Path 'android_project\app\src\main\assets\www' -Recurse -Include index.html,app-1.js,sw.js | ForEach-Object {
    $hits = Select-String -Path $_.FullName -Pattern $pattern
    if ($hits) {
        Write-Host "--- $($_.FullName) ---"
        $hits | ForEach-Object {
            Write-Host ("  L{0}: {1}" -f $_.LineNumber, $_.Line.Trim())
        }
    }
}

Write-Host "`n=== Android 工程 (build.gradle) ==="
$gradleHits = Select-String -Path 'android_project\app\build.gradle' -Pattern 'versionCode|versionName'
$gradleHits | ForEach-Object {
    Write-Host ("  L{0}: {1}" -f $_.LineNumber, $_.Line.Trim())
}

Write-Host "`n=== 是否有 v9.17.7 残留? ==="
$oldHits = Select-String -Path 'android_project\app\src\main\assets\www\index.html','android_project\app\src\main\assets\www\js\app-1.js','android_project\app\src\main\assets\www\sw.js','android_project\app\build.gradle' -Pattern 'v9\.17\.7|9\.17\.7'
if ($oldHits) {
    Write-Host "[警告] 发现 v9.17.7 残留:"
    $oldHits | ForEach-Object { Write-Host ("  {0}:L{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim()) }
} else {
    Write-Host "[OK] 无 v9.17.7 残留"
}

Write-Host "`n=== 是否有 v9.17.8? ==="
$newHits = Select-String -Path 'android_project\app\src\main\assets\www\index.html','android_project\app\src\main\assets\www\js\app-1.js','android_project\app\src\main\assets\www\sw.js','android_project\app\build.gradle' -Pattern 'v9\.17\.8|9\.17\.8'
$newHits | ForEach-Object { Write-Host ("  {0}:L{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim()) }