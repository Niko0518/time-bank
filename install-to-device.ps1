# ============================================================
# TimeBank 一键安装到当前连接的 USB 设备（速度优先）
# 用法：右键 → "使用 PowerShell 运行"，或在 PowerShell 中执行：
#       .\install-to-device.ps1
# 前置：手机已开启 USB 调试，且已授权此电脑
# 适用：仅修改了前端 JS/CSS/HTML 的增量构建
#       如改动了 Java/Gradle/Manifest，请先在脚本内将 $CleanFirst 设为 $true
# ============================================================

$ErrorActionPreference = 'Stop'

# --- 配置 ---
$AdbPath         = 'D:\SDK\platform-tools\adb.exe'
$ProjectRoot     = $PSScriptRoot
$Gradlew         = Join-Path $ProjectRoot 'android_project\gradlew.bat'
$ApkRelativePath = 'android_project\app\build\outputs\apk\debug\app-debug.apk'
$ApkFullPath     = Join-Path $ProjectRoot $ApkRelativePath
$PackageName     = 'com.jianglicheng.timebank'
$ActivityName    = '.MainActivity'
$CleanFirst      = $false   # 改 Java/Gradle 时改为 $true

# --- 0. 前置检查 ---
if (-not (Test-Path $AdbPath)) {
    Write-Host "[错误] 找不到 adb：$AdbPath" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $Gradlew)) {
    Write-Host "[错误] 找不到 gradlew：$Gradlew" -ForegroundColor Red
    exit 1
}

# --- 1. 检测 USB 设备 ---
Write-Host "`n[1/4] 检测 USB 设备..." -ForegroundColor Cyan
$devicesOutput = & $AdbPath devices
$deviceLines = $devicesOutput | Select-String -Pattern 'device$' | Where-Object { $_.Line -notmatch 'List of devices' }

if ($deviceLines.Count -eq 0) {
    Write-Host "[错误] 未检测到已连接的 USB 设备。" -ForegroundColor Red
    Write-Host "  请确认：" -ForegroundColor Yellow
    Write-Host "    1) 手机已用 USB 线连接电脑"
    Write-Host "    2) 手机已开启"开发者选项"和"USB 调试""
    Write-Host "    3) 手机弹出授权框时点了"允许""
    Write-Host "`n当前 adb 设备列表：" -ForegroundColor Yellow
    & $AdbPath devices
    exit 1
}
Write-Host "  ✓ 已连接 $($deviceLines.Count) 台设备" -ForegroundColor Green

# --- 2. 构建 ---
Write-Host "`n[2/4] 构建 Debug APK（增量）..." -ForegroundColor Cyan
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Push-Location $ProjectRoot
try {
    if ($CleanFirst) {
        Write-Host "  (Clean 模式：清理后重建)" -ForegroundColor Yellow
        & cmd.exe /c "android_project\gradlew.bat -p android_project clean" | Out-Null
    }
    & cmd.exe /c "android_project\gradlew.bat -p android_project assembleDebug --offline" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # 离线缓存可能 miss，回退到在线构建
        Write-Host "  (离线缓存 miss，回退在线构建)" -ForegroundColor Yellow
        & cmd.exe /c "android_project\gradlew.bat -p android_project assembleDebug" 2>&1 | Out-Null
    }
} finally {
    Pop-Location
}
$sw.Stop()

if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 构建失败，请查看上方日志。" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host ("  ✓ 构建完成，耗时 {0:N1}s" -f $sw.Elapsed.TotalSeconds) -ForegroundColor Green

if (-not (Test-Path $ApkFullPath)) {
    Write-Host "[错误] 找不到 APK：$ApkFullPath" -ForegroundColor Red
    exit 1
}

# --- 3. 安装 ---
Write-Host "`n[3/4] 安装到设备..." -ForegroundColor Cyan
$sw = [System.Diagnostics.Stopwatch]::StartNew()
& $AdbPath install -r -g $ApkFullPath 2>&1 | Out-Null
$sw.Stop()
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 安装失败，请查看上方日志。" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host ("  ✓ 安装完成，耗时 {0:N1}s" -f $sw.Elapsed.TotalSeconds) -ForegroundColor Green

# --- 4. 启动 ---
Write-Host "`n[4/4] 启动应用..." -ForegroundColor Cyan
& $AdbPath shell am start -n "$PackageName/$ActivityName" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[警告] 应用启动失败，但已成功安装。请手动打开。" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  ✓ 完成！应用已启动" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green