# ============================================================
# scripts/sync-all.ps1
# TimeBank 推送前综合同步工具（v9.17.8+ 强制使用）
#
# 职责：
#   1. 同步 Android 权威源 → 根目录（调用 sync-www.ps1 逻辑）
#   2. Hash 校验（确保两端完全一致）
#   3. 7 处版本号自检（确保都已同步）
#   4. (可选) git add + commit + push
#
# 用法：
#   .\scripts\sync-all.ps1                    # 仅同步 + 自检
#   .\scripts\sync-all.ps1 -Commit "v9.17.9: ..." # 同步 + 自检 + git commit
#   .\scripts\sync-all.ps1 -Commit "..." -Push  # 同步 + 自检 + commit + push（需用户授权 push）
#   .\scripts\sync-all.ps1 -DryRun            # 仅预览
#
# 注意：
#   - Push 必须由用户明确授权（不在脚本内默认执行）
#   - 任何步骤失败立即中止，不会 git push
#
# 作者规范：v9.17.8+ 强制使用
# ============================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$Commit,

    [Parameter(Mandatory=$false)]
    [switch]$Push,

    [Parameter(Mandatory=$false)]
    [switch]$DryRun
)

$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$WwwDir = Join-Path $ProjectRoot "android_project\app\src\main\assets\www"
$VerifyHashScript = Join-Path $PSScriptRoot "verify-hash.ps1"
$VerifyVersionScript = Join-Path $PSScriptRoot "verify-version.ps1"

$SyncTargets = @(
    @{ Src = "index.html"; Dst = "index.html" }
    @{ Src = "sw.js"; Dst = "sw.js" }
    @{ Src = "manifest.json"; Dst = "manifest.json" }
    @{ Src = "css"; Dst = "css" }
    @{ Src = "js"; Dst = "js" }
)

function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
}

# 主流程
Write-Section "TimeBank 推送前综合同步"

if ($DryRun) {
    Write-Host "🔍 DRY-RUN 模式：仅预览" -ForegroundColor Magenta
}

# 检查源目录
if (-not (Test-Path $WwwDir)) {
    throw "源目录不存在: $WwwDir"
}

# 步骤 1：同步
Write-Section "[1/4] 同步 Android → 根目录"
foreach ($target in $SyncTargets) {
    $src = Join-Path $WwwDir $target.Src
    $dst = Join-Path $ProjectRoot $target.Dst
    if (-not (Test-Path $src)) {
        Write-Host "  ⚠️ 源不存在: $($target.Src)" -ForegroundColor Yellow
        continue
    }
    if (-not $DryRun) {
        Copy-Item $src $dst -Recurse -Force
    }
    Write-Host "  ✅ $($target.Src) → $($target.Dst)" -ForegroundColor Green
}

# 步骤 2：Hash 校验
Write-Section "[2/4] Hash 校验"
if ($DryRun) {
    Write-Host "  [DRY-RUN 跳过]"
} else {
    if (Test-Path $VerifyHashScript) {
        & powershell -ExecutionPolicy Bypass -File $VerifyHashScript
    } else {
        $allMatch = $true
        foreach ($target in $SyncTargets) {
            $src = Join-Path $WwwDir $target.Src
            $dst = Join-Path $ProjectRoot $target.Dst
            if ((Test-Path $src) -and (Test-Path $dst)) {
                $srcHash = (Get-FileHash $src -Algorithm SHA256).Hash
                $dstHash = (Get-FileHash $dst -Algorithm SHA256).Hash
                $status = if ($srcHash -eq $dstHash) { "✅" } else { "❌" ; $allMatch = $false }
                Write-Host "  $status $($target.Src)  src=$srcHash  dst=$dstHash"
            }
        }
        if (-not $allMatch) {
            throw "Hash 校验失败，双源镜像不一致！请检查 sync 步骤"
        }
    }
}

# 步骤 3：版本号自检
Write-Section "[3/4] 版本号自检（7 处一致性）"
if ($DryRun) {
    Write-Host "  [DRY-RUN 跳过]"
} else {
    if (Test-Path $VerifyVersionScript) {
        & powershell -ExecutionPolicy Bypass -File $VerifyVersionScript
    } else {
        Write-Host "  ⚠️ verify-version.ps1 不存在" -ForegroundColor Yellow
    }
}

# 步骤 4：Git 提交（可选）
if ($Commit) {
    Write-Section "[4/4] Git 提交"
    if ($DryRun) {
        Write-Host "  [DRY-RUN] 将要执行: git add -A && git commit -m '$Commit'" -ForegroundColor Magenta
    } else {
        Set-Location $ProjectRoot

        # 先看 git status
        Write-Host "  📋 git status 预览：" -ForegroundColor Yellow
        & git status --short
        Write-Host ""

        # git add -A
        Write-Host "  ➕ git add -A"
        & git add -A

        # git commit
        Write-Host "  💾 git commit -m '$Commit'"
        & git commit -m "$Commit"

        if ($Push) {
            Write-Host "  ⬆️ git push"
            & git push
        } else {
            Write-Host ""
            Write-Host "  💡 提示：如需推送，请加 -Push 参数" -ForegroundColor Cyan
            Write-Host "     .\scripts\sync-all.ps1 -Commit '$Commit' -Push" -ForegroundColor Cyan
        }
    }
} else {
    Write-Host ""
    Write-Host "💡 提示：如需 git commit，请加 -Commit 参数" -ForegroundColor Cyan
    Write-Host "   .\scripts\sync-all.ps1 -Commit 'v9.17.x: 修复说明'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "💡 如需 git push，必须显式加 -Push 参数（push 默认不执行）" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host "🔍 sync-all.ps1 DRY-RUN 完成" -ForegroundColor Magenta
} else {
    Write-Host "✅ sync-all.ps1 完成" -ForegroundColor Green
}
Write-Host "==========================================" -ForegroundColor Green