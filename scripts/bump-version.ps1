# ============================================================
# scripts/bump-version.ps1
# TimeBank 版本号一键同步工具（v9.17.8+ 强制使用）
#
# 职责：
#   1. 修改 7 处版本号（index.html ×3, app-1.js, sw.js ×2, build.gradle ×2）
#   2. 自动调用 verify-version.ps1 自检
#   3. 检测历史日志条目（保留不动）
#   4. 检测 BOM 字符干扰
#
# 用法：
#   .\scripts\bump-version.ps1 -NewVersion "9.17.9" -Subtitle "新特性词组"
#   .\scripts\bump-version.ps1 -NewVersion "9.17.9" -VersionCode 88 -Subtitle "新特性词组"
#   .\scripts\bump-version.ps1 -NewVersion "9.17.9" -Subtitle "..." -DryRun
#   .\scripts\bump-version.ps1 -Subtitle "..."  # 不传 NewVersion 时自动 +0.0.1
#
# 作者规范：v9.17.8+ 强制使用，禁止手动 SearchReplace 改 7 处版本号
# ============================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$NewVersion,

    [Parameter(Mandatory=$false)]
    [int]$VersionCode,

    [Parameter(Mandatory=$true)]
    [string]$Subtitle,

    [Parameter(Mandatory=$false)]
    [switch]$DryRun,

    [Parameter(Mandatory=$false)]
    [switch]$AutoIncrement
)

# 路径常量
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$WwwDir = Join-Path $ProjectRoot "android_project\app\src\main\assets\www"
$IndexHtml = Join-Path $WwwDir "index.html"
$App1Js = Join-Path $WwwDir "js\app-1.js"
$SwJs = Join-Path $WwwDir "sw.js"
$BuildGradle = Join-Path $ProjectRoot "android_project\app\build.gradle"
$VerifyScript = Join-Path $PSScriptRoot "verify-version.ps1"

# 工具函数
function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
}

function Read-FileContent {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        throw "文件不存在: $Path"
    }
    # 用 Raw 读取，避免 BOM 字符串匹配的精确性问题
    $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    # 去除 BOM 字符（U+FEFF）
    if ($content.Length -gt 0 -and $content[0] -eq [char]0xFEFF) {
        $content = $content.Substring(1)
    }
    return $content
}

function Write-FileContent {
    param([string]$Path, [string]$Content)
    # 写入时也不加 BOM
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

# 提取当前版本号（从 app-1.js 的 APP_VERSION 常量）
function Get-CurrentVersion {
    param([string]$Content)
    if ($Content -match "const APP_VERSION = 'v?([0-9]+\.[0-9]+\.[0-9]+)'") {
        return $matches[1]
    }
    throw "无法从 app-1.js 提取当前版本号"
}

# 自动递增小版本（X.Y.Z → X.Y.(Z+1)）
function Get-AutoIncrementedVersion {
    param([string]$Current)
    $parts = $Current.Split('.')
    $parts[2] = [int]$parts[2] + 1
    return ($parts -join '.')
}

# 主流程
Write-Section "TimeBank 版本号同步工具 (v9.17.8+)"

# 读取当前版本
$currentContent = Read-FileContent $App1Js
$currentVersion = Get-CurrentVersion $currentContent
Write-Host "当前版本: v$currentVersion" -ForegroundColor Yellow

# 确定目标版本号
if (-not $NewVersion) {
    if ($AutoIncrement) {
        $NewVersion = Get-AutoIncrementedVersion $currentVersion
        Write-Host "AutoIncrement: v$currentVersion → v$NewVersion" -ForegroundColor Green
    } else {
        throw "必须指定 -NewVersion 或使用 -AutoIncrement"
    }
}

# 验证版本号格式
if ($NewVersion -notmatch "^[0-9]+\.[0-9]+\.[0-9]+$") {
    throw "版本号格式错误: $NewVersion（应为 X.Y.Z 形式）"
}

# 自动计算 versionCode（如未指定）
if (-not $VersionCode) {
    $gradleContent = Read-FileContent $BuildGradle
    if ($gradleContent -match "versionCode\s+(\d+)") {
        $VersionCode = [int]$matches[1] + 1
        Write-Host "自动计算 versionCode: $($matches[1]) + 1 = $VersionCode" -ForegroundColor Green
    } else {
        throw "无法从 build.gradle 提取 versionCode，请手动指定 -VersionCode"
    }
}

Write-Host "目标版本: v$NewVersion (build $VersionCode)" -ForegroundColor Yellow
Write-Host "副标题: $Subtitle" -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY-RUN 模式：仅预览，不实际修改文件" -ForegroundColor Magenta
}

# 改 index.html（3 处）
Write-Section "修改 index.html"

$indexContent = Read-FileContent $IndexHtml

# 1) <title> 标签
$titlePattern = "时间银行 - Time Bank v[0-9]+\.[0-9]+\.[0-9]+"
$titleReplacement = "时间银行 - Time Bank v$NewVersion"
$newContent = $indexContent -replace $titlePattern, $titleReplacement
$titleChanged = ($newContent -ne $indexContent)
$indexContent = $newContent
Write-Host "  [1] <title>: $(if($titleChanged){'✅ 已替换'}else{'⚠️ 未找到匹配'})"

# 2) 副标题
$subtitlePattern = '<div class="version-subtitle">TimeBank v[0-9]+\.[0-9]+\.[0-9]+ · [^<]+</div>'
$subtitleReplacement = "<div class=`"version-subtitle`">TimeBank v$NewVersion · $Subtitle</div>"
$newContent = $indexContent -replace $subtitlePattern, $subtitleReplacement
$subtitleChanged = ($newContent -ne $indexContent)
$indexContent = $newContent
Write-Host "  [2] 副标题: $(if($subtitleChanged){'✅ 已替换'}else{'⚠️ 未找到匹配'})"

# 3) 关于页"版本 vX.Y.Z"
$aboutPattern = '<div style="font-size: 0\.85rem; color: var\(--text-color-light\);">版本 v[0-9]+\.[0-9]+\.[0-9]+</div>'
$aboutReplacement = "<div style=`"font-size: 0.85rem; color: var(--text-color-light);`">版本 v$NewVersion</div>"
$newContent = $indexContent -replace $aboutPattern, $aboutReplacement
$aboutChanged = ($newContent -ne $indexContent)
$indexContent = $newContent
Write-Host "  [3] 关于页: $(if($aboutChanged){'✅ 已替换'}else{'⚠️ 未找到匹配'})"

# ⚠️ 注意：不修改历史日志条目（v$currentVersion 的 <p> 标签）

# 改 app-1.js（1 处）
Write-Section "修改 js/app-1.js"

$app1Pattern = "const APP_VERSION = 'v[0-9]+\.[0-9]+\.[0-9]+';"
$app1Replacement = "const APP_VERSION = 'v$NewVersion';"
$newApp1Content = $app1Content -replace $app1Pattern, $app1Replacement
$app1Changed = ($newApp1Content -ne $app1Content)
Write-Host "  [4] APP_VERSION: $(if($app1Changed){'✅ 已替换'}else{'⚠️ 未找到匹配'})"

# 改 sw.js（2 处）
Write-Section "修改 sw.js"

$swContent = Read-FileContent $SwJs

# 顶部注释
$swCommentPattern = "// Time Bank Service Worker - v[0-9]+\.[0-9]+\.[0-9]+"
$swCommentReplacement = "// Time Bank Service Worker - v$NewVersion"
$newSwContent = $swContent -replace $swCommentPattern, $swCommentReplacement

# CACHE_NAME
$cachePattern = "const CACHE_NAME = 'timebank-cache-v[0-9]+\.[0-9]+\.[0-9]+';"
$cacheReplacement = "const CACHE_NAME = 'timebank-cache-v$NewVersion';"
$newSwContent = $newSwContent -replace $cachePattern, $cacheReplacement

$swChanged = ($newSwContent -ne $swContent)
Write-Host "  [5] sw.js 注释: $(if($swContent -ne ($swContent -replace $swCommentPattern, $swCommentReplacement)){'✅'}else{'⚠️'})"
Write-Host "  [6] CACHE_NAME: $(if($swContent -ne ($swContent -replace $cachePattern, $cacheReplacement)){'✅'}else{'⚠️'})"

# 改 build.gradle（2 处）
Write-Section "修改 build.gradle"

$gradleContent = Read-FileContent $BuildGradle

# versionCode
$vcPattern = "versionCode\s+\d+\s*(//[^\n]*)?"
$vcReplacement = "versionCode $VersionCode  // [v$NewVersion] 自动递增（bump-version.ps1 生成）"
$newGradleContent = $gradleContent -replace $vcPattern, $vcReplacement

# versionName
$vnPattern = 'versionName\s+"[0-9]+\.[0-9]+\.[0-9]+"'
$vnReplacement = "versionName `"$NewVersion`""
$newGradleContent = $newGradleContent -replace $vnPattern, $vnReplacement

$gradleChanged = ($newGradleContent -ne $gradleContent)
Write-Host "  [7] versionCode + versionName: $(if($gradleChanged){'✅ 已替换'}else{'⚠️ 未找到匹配'})"

# 写入文件
if (-not $DryRun) {
    Write-Section "写入文件"

    if ($indexContent -ne (Read-FileContent $IndexHtml)) {
        Write-FileContent $IndexHtml $indexContent
        Write-Host "  ✅ index.html" -ForegroundColor Green
    }

    if ($app1Changed) {
        Write-FileContent $App1Js $newApp1Content
        Write-Host "  ✅ js/app-1.js" -ForegroundColor Green
    }

    if ($swChanged) {
        Write-FileContent $SwJs $newSwContent
        Write-Host "  ✅ sw.js" -ForegroundColor Green
    }

    if ($gradleChanged) {
        Write-FileContent $BuildGradle $newGradleContent
        Write-Host "  ✅ build.gradle" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "🔍 DRY-RUN 完成，未修改任何文件" -ForegroundColor Magenta
}

# 自动自检
if (-not $DryRun) {
    Write-Section "自动自检（verify-version.ps1）"
    if (Test-Path $VerifyScript) {
        & powershell -ExecutionPolicy Bypass -File $VerifyScript
    } else {
        Write-Host "⚠️ verify-version.ps1 不存在，跳过自检" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ bump-version.ps1 完成: v$currentVersion → v$NewVersion (build $VersionCode)" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green