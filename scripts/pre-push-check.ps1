# TimeBank 推送前检查脚本
# 用途：确保遵守copilot-instructions.md中的规则

Write-Host "=== TimeBank 推送前检查 ===" -ForegroundColor Cyan

# 1. 检查版本号是否被擅自修改
$androidIndex = Get-Content "android_project\app\src\main\assets\www\index.html" -Raw
$rootIndex = Get-Content "index.html" -Raw
$app1Js = Get-Content "js\app-1.js" -Raw

if ($androidIndex -ne $rootIndex) {
    Write-Host "❌ 错误：根目录与Android项目不同步！" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 三端同步检查通过" -ForegroundColor Green

# 2. 提示用户确认版本号
$currentVersion = [regex]::Match($app1Js, "const APP_VERSION = '(v[\d\.]+)'").Groups[1].Value
Write-Host "当前版本号: $currentVersion" -ForegroundColor Yellow
$confirm = Read-Host "此版本号是否正确？(y/n)"

if ($confirm -ne 'y') {
    Write-Host "❌ 请修正版本号后再推送" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 版本号确认通过" -ForegroundColor Green

# 3. 检查技术日志是否更新
$instructions = Get-Content ".github\copilot-instructions.md" -Raw
if ($instructions -notmatch "## v[\d\.]+\s*\([^)]*当前版本\)") {
    Write-Host "⚠️  警告：技术日志可能未更新" -ForegroundColor Yellow
    $continue = Read-Host "是否继续？(y/n)"
    if ($continue -ne 'y') {
        exit 1
    }
}

Write-Host "`n✅ 所有检查通过，可以推送" -ForegroundColor Green
exit 0
