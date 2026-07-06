# ============================================================
# scripts/sync-www.ps1
# Android 权威源 → 根目录 PWA 同步工具（v9.17.8+ 强制使用）
#
# 职责：
#   1. 同步 android_project/app/src/main/assets/www/ 到根目录
#   2. 同步后自动跑 hash 校验
#   3. 可选：启本地 HTTP 服务器供 PWA 预览
#
# 用法：
#   .\scripts\sync-www.ps1                    # 仅同步（不启预览）
#   .\scripts\sync-www.ps1 -Preview           # 同步 + 启 http server 预览
#   .\scripts\sync-www.ps1 -Preview -Port 8080
#   .\scripts\sync-www.ps1 -DryRun            # 仅预览，不实际复制
#
# 何时使用：
#   - 推送前（与 sync-all.ps1 类似，但本脚本更轻量）
#   - 跨设备调试（不依赖 USB 验证前端修复效果）
#
# 作者规范：v9.17.8+ 强制使用，禁止手动写 Copy-Item
# ============================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [switch]$Preview,

    [Parameter(Mandatory=$false)]
    [int]$Port = 8000,

    [Parameter(Mandatory=$false)]
    [switch]$DryRun
)

$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$WwwDir = Join-Path $ProjectRoot "android_project\app\src\main\assets\www"
$VerifyHashScript = Join-Path $PSScriptRoot "verify-hash.ps1"

function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
}

# 同步单个文件（直接覆盖）
function Sync-File {
    param(
        [string]$Src,  # 源文件路径
        [string]$Dst   # 目标文件路径
    )
    if ($DryRun) {
        Write-Host "  [DRY] $Src → $Dst" -ForegroundColor Magenta
        return
    }
    if (-not (Test-Path $Src)) {
        Write-Host "  ⚠️ 源文件不存在: $Src" -ForegroundColor Yellow
        return
    }
    $dstDir = Split-Path $Dst -Parent
    if (-not (Test-Path $dstDir)) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
    }
    Copy-Item $Src $Dst -Force
    Write-Host "  ✅ $Src → $Dst" -ForegroundColor Green
}

# 同步目录（递归合并到目标目录）
# 关键：手动递归，避免 Copy-Item 同名目录嵌套陷阱
function Sync-Directory {
    param(
        [string]$Src,  # 源目录路径
        [string]$Dst   # 目标目录路径
    )
    if ($DryRun) {
        Write-Host "  [DRY] $Src\* → $Dst" -ForegroundColor Magenta
        return
    }
    if (-not (Test-Path $Src)) {
        Write-Host "  ⚠️ 源目录不存在: $Src" -ForegroundColor Yellow
        return
    }

    # 确保目标目录存在
    if (-not (Test-Path $Dst)) {
        New-Item -ItemType Directory -Path $Dst -Force | Out-Null
    }

    # 递归同步源目录内的每一项
    Get-ChildItem $Src -Force | ForEach-Object {
        $srcItem = $_.FullName
        $dstItem = Join-Path $Dst $_.Name

        if ($_.PSIsContainer) {
            # 子目录：递归
            Sync-Directory -Src $srcItem -Dst $dstItem
        } else {
            # 文件：复制
            Copy-Item $srcItem $dstItem -Force
        }
    }

    Write-Host "  ✅ $Src\* → $Dst" -ForegroundColor Green
}

# 主流程
Write-Section "TimeBank 双源同步 (Android → 根目录)"

if ($DryRun) {
    Write-Host "🔍 DRY-RUN 模式：仅预览同步目标" -ForegroundColor Magenta
}

# 检查源目录
if (-not (Test-Path $WwwDir)) {
    throw "源目录不存在: $WwwDir"
}

# 同步文件/目录
Write-Section "同步文件清单"
Sync-File -Src (Join-Path $WwwDir "index.html") -Dst (Join-Path $ProjectRoot "index.html")
Sync-File -Src (Join-Path $WwwDir "sw.js") -Dst (Join-Path $ProjectRoot "sw.js")
Sync-File -Src (Join-Path $WwwDir "manifest.json") -Dst (Join-Path $ProjectRoot "manifest.json")
Sync-Directory -Src (Join-Path $WwwDir "css") -Dst (Join-Path $ProjectRoot "css")
Sync-Directory -Src (Join-Path $WwwDir "js") -Dst (Join-Path $ProjectRoot "js")

# Hash 校验
if (-not $DryRun) {
    Write-Section "Hash 校验（双源镜像一致性）"
    if (Test-Path $VerifyHashScript) {
        & powershell -ExecutionPolicy Bypass -File $VerifyHashScript
    } else {
        Write-Host "  ⚠️ verify-hash.ps1 不存在" -ForegroundColor Yellow
    }
}

# 可选：启动预览服务器
if ($Preview -and -not $DryRun) {
    Write-Section "启动本地 HTTP 预览服务器"

    # 找 Python
    $python = $null
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $python = "python"
    } elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
        $python = "python3"
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        $python = "py"
    }

    if (-not $python) {
        Write-Host "  ⚠️ 未检测到 Python，无法启动预览" -ForegroundColor Yellow
        Write-Host "  💡 请安装 Python 或手动运行: python -m http.server $Port" -ForegroundColor Yellow
    } else {
        Write-Host "  🚀 启动 $python -m http.server $Port (根目录)" -ForegroundColor Green
        Write-Host "  📱 浏览器打开: http://localhost:$Port/" -ForegroundColor Green
        Write-Host "  ⏹️  按 Ctrl+C 停止" -ForegroundColor Yellow
        Write-Host ""
        Set-Location $ProjectRoot
        & $python -m http.server $Port
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host "🔍 sync-www.ps1 DRY-RUN 完成" -ForegroundColor Magenta
} else {
    Write-Host "✅ sync-www.ps1 完成：Android → 根目录" -ForegroundColor Green
}
Write-Host "==========================================" -ForegroundColor Green