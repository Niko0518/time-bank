Set-Location 'D:\TimeBank'

Write-Host "===== [1/4] 双端同步（assets/www → 根目录）=====" -ForegroundColor Cyan
Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
Copy-Item "android_project/app/src/main/assets/www/sw.js" "sw.js" -Force
Copy-Item "android_project/app/src/main/assets/www/manifest.json" "manifest.json" -Force
Copy-Item "android_project/app/src/main/assets/www/css/*" "css/" -Recurse -Force
Copy-Item "android_project/app/src/main/assets/www/js/*" "js/" -Recurse -Force
Write-Host "✅ 同步完成" -ForegroundColor Green

Write-Host ""
Write-Host "===== [2/4] Hash 验证（确保两端完全一致）=====" -ForegroundColor Cyan
$files = @('index.html', 'sw.js', 'manifest.json', 'css\main.css',
           'js\app-1.js', 'js\app-2.js', 'js\app-reports.js', 'js\app-auth.js',
           'js\app-systems.js', 'js\app-sleep.js', 'js\ai-service.js')
$bad = 0
foreach ($f in $files) {
    $src = "android_project\app\src\main\assets\www\$f"
    $dst = "$f"
    $h1 = (Get-FileHash -Path $src -Algorithm SHA256).Hash
    $h2 = (Get-FileHash -Path $dst -Algorithm SHA256).Hash
    if ($h1 -eq $h2) {
        Write-Host "  [OK]  $f" -ForegroundColor Green
    } else {
        Write-Host "  [BAD] $f  src=$h1 dst=$h2" -ForegroundColor Red
        $bad++
    }
}
if ($bad -gt 0) { Write-Host "❌ Hash 验证失败" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "===== [3/4] 10 处版本号检查（必须全部 v9.15.0）=====" -ForegroundColor Cyan
$checks = @(
    @{ Name='AGENTS.md 当前版本';                          Path='AGENTS.md';                                                                Pattern='v9\.15\.0'},
    @{ Name='index.html .version-subtitle (副标题)';        Path='android_project\app\src\main\assets\www\index.html';                       Pattern='TimeBank v9\.15\.0'},
    @{ Name='index.html <title>';                           Path='android_project\app\src\main\assets\www\index.html';                       Pattern='Time Bank v9\.15\.0'},
    @{ Name='index.html 关于页版本号';                       Path='android_project\app\src\main\assets\www\index.html';                       Pattern='版本 v9\.15\.0'},
    @{ Name='index.html 用户日志版本标题';                   Path='android_project\app\src\main\assets\www\index.html';                       Pattern='v9\.15\.0 \(2026-06-23\)'},
    @{ Name='js/app-1.js APP_VERSION';                      Path='android_project\app\src\main\assets\www\js\app-1.js';                     Pattern="APP_VERSION = 'v9\.15\.0'"},
    @{ Name='sw.js 头部注释';                               Path='android_project\app\src\main\assets\www\sw.js';                          Pattern='Service Worker - v9\.15\.0'},
    @{ Name='sw.js CACHE_NAME';                             Path='android_project\app\src\main\assets\www\sw.js';                          Pattern="CACHE_NAME = 'timebank-cache-v9\.15\.0'"},
    @{ Name='build.gradle versionName';                     Path='android_project\app\build.gradle';                                          Pattern='versionName "9\.15\.0"'},
    @{ Name='build.gradle versionCode 注释';                 Path='android_project\app\build.gradle';                                          Pattern='versionCode 75'}
)
$bad2 = 0
foreach ($c in $checks) {
    $content = Get-Content -Path $c.Path -Raw -Encoding UTF8
    if ($content -match $c.Pattern) {
        Write-Host "  [OK] $($c.Name)" -ForegroundColor Green
    } else {
        Write-Host "  [BAD] $($c.Name)  (file=$($c.Path), pattern=$($c.Pattern))" -ForegroundColor Red
        $bad2++
    }
}
if ($bad2 -gt 0) { Write-Host "❌ 版本号检查失败" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "===== [4/4] 日志检查 =====" -ForegroundColor Cyan
$cl = Get-Content "docs\version-changelog.md" -Raw
if ($cl -match "## v9\.15\.0") {
    Write-Host "  [OK] docs/version-changelog.md 有 v9.15.0 条目" -ForegroundColor Green
} else {
    Write-Host "  [BAD] docs/version-changelog.md 缺 v9.15.0 条目" -ForegroundColor Red; exit 1
}
$idx = Get-Content "android_project\app\src\main\assets\www\index.html" -Raw
if ($idx -match "版本 v9\.15\.0 \(2026-06-23\)") {
    Write-Host "  [OK] index.html 用户日志有 v9.15.0 条目" -ForegroundColor Green
} else {
    Write-Host "  [BAD] index.html 用户日志缺 v9.15.0 条目" -ForegroundColor Red; exit 1
}

Write-Host ""
Write-Host "===== 全部预检通过 ✅ =====" -ForegroundColor Green
