# ============================================================
# TimeBank 构建可在其他设备直接点击安装的 APK（无需 adb）
# 用法：右键 → "使用 PowerShell 运行"
# 输出：在脚本所在目录生成 TimeBank-vX.Y.Z-debug-yyyyMMdd-HHmm.apk
#       可拷贝到任何 Android 设备，在文件管理器中点击安装
# 注意：
#   1) 这是 debug 包（与日常开发一致），非 release 包
#   2) 目标设备首次安装需要在"设置 → 安全 → 安装未知应用"
#      中授权"文件管理器"或对应来源
#   3) 若改了 Java/Gradle/Manifest，请将 $CleanFirst 改为 $true
# ============================================================

$ErrorActionPreference = 'Stop'

# --- 配置 ---
$ProjectRoot     = $PSScriptRoot
$Gradlew         = Join-Path $ProjectRoot 'android_project\gradlew.bat'
$ApkRelativePath = 'android_project\app\build\outputs\apk\debug\app-debug.apk'
$ApkFullPath     = Join-Path $ProjectRoot $ApkRelativePath
$CleanFirst      = $false

# --- 0. 前置检查 ---
if (-not (Test-Path $Gradlew)) {
    Write-Host "[错误] 找不到 gradlew：$Gradlew" -ForegroundColor Red
    exit 1
}

# --- 1. 读取版本号（用于输出文件名） ---
Write-Host "`n[1/4] 读取版本号..." -ForegroundColor Cyan
$versionName = 'unknown'
$versionCode = '0'
$buildGradle = Join-Path $ProjectRoot 'android_project\app\build.gradle'
if (Test-Path $buildGradle) {
    $content = Get-Content $buildGradle -Raw
    if ($content -match 'versionName\s+"([^"]+)"') { $versionName = $Matches[1] }
    if ($content -match 'versionCode\s+(\d+)')    { $versionCode = $Matches[1] }
}
Write-Host "  版本：$versionName (code $versionCode)" -ForegroundColor Green

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

# --- 3. 复制并重命名 ---
Write-Host "`n[3/4] 复制 APK 到项目根目录..." -ForegroundColor Cyan
$timestamp  = Get-Date -Format 'yyyyMMdd-HHmm'
$outputName = "TimeBank-v$versionName-debug-$timestamp.apk"
$outputPath = Join-Path $ProjectRoot $outputName

Copy-Item $ApkFullPath $outputPath -Force
$sizeMB = [math]::Round((Get-Item $outputPath).Length / 1MB, 2)
Write-Host "  ✓ 输出：$outputName ($sizeMB MB)" -ForegroundColor Green

# --- 4. 同时复制一份到桌面，方便取用 ---
Write-Host "`n[4/4] 复制到桌面..." -ForegroundColor Cyan
try {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (Test-Path $desktop) {
        $desktopPath = Join-Path $desktop $outputName
        Copy-Item $outputPath $desktopPath -Force
        Write-Host "  ✓ 桌面副本：$desktopPath" -ForegroundColor Green
    } else {
        Write-Host "  (跳过：未找到桌面目录)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  (跳过桌面副本：$($_.Exception.Message))" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  ✓ 完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`n分发到其他设备的步骤：" -ForegroundColor Cyan
Write-Host "  1) 把 APK 文件（U 盘/网盘/微信文件/邮件均可）传到目标手机"
Write-Host "  2) 手机文件管理器打开 APK"
Write-Host "  3) 首次会提示授权"安装未知应用"，按提示开启"
Write-Host "  4) 点"安装"即可`n"