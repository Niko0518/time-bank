# TimeBank 推送前检查脚本
# 用途：确保遵守copilot-instructions.md中的规则

# [v9.2.0] 从 js/app-1.js 提取 APP_VERSION 并自动注入到 AGENTS.md

# ---------- 提取版本号 ----------
$app1Js = Get-Content "js\app-1.js" -Raw
$currentVersion = [regex]::Match($app1Js, "const APP_VERSION = '(v[\d\.]+)'").Groups[1].Value
if (-not $currentVersion) {
    Write-Host "[ERR] 未能从 js/app-1.js 提取 APP_VERSION" -ForegroundColor Red
    exit 1
}
Write-Host ("当前版本号: " + $currentVersion) -ForegroundColor Yellow

# ---------- 检查三端同步 ----------
$androidIndex = Get-Content "android_project\app\src\main\assets\www\index.html" -Raw
$rootIndex = Get-Content "index.html" -Raw
if ($androidIndex -ne $rootIndex) {
    Write-Host "[ERR] 根目录与 Android 项目不同步！" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] 三端同步检查通过" -ForegroundColor Green

# ---------- 自动注入 AGENTS.md ----------
# 双向兼容：
#   1. 如果 AGENTS.md 包含 {{APP_VERSION}} 占位符 → 替换为当前版本号（首次注入）
#   2. 如果 AGENTS.md 已写入旧版本号 → 替换为当前版本号（更新场景）
$agentsPath = "AGENTS.md"
$agentsContent = Get-Content $agentsPath -Raw
$placeholder = '{{APP_VERSION}}'
$injected = $false
if ($agentsContent.Contains($placeholder)) {
    $newContent = $agentsContent.Replace($placeholder, $currentVersion)
    Set-Content -Path $agentsPath -Value $newContent -NoNewline
    Write-Host ("[OK] AGENTS.md 占位符已替换为 " + $currentVersion) -ForegroundColor Green
    $injected = $true
} else {
    # 查找 "**当前版本**：`vX.Y.Z`" 模式（仅 line 69 标题行）
    # 用 [^\n]*? 限制只匹配本行，且限制"自动从"等文案内不替换
    $oldPattern = '(?ms)(\A[^\n]*?\*\*当前版本\*\*：`)v[\d\.]+(`)'
    if ($agentsContent -match $oldPattern) {
        $oldVersion = $matches[0]
        if ($oldVersion -notmatch [regex]::Escape($currentVersion)) {
            # 只替换一次（line 69），避免误改 changelog 章节中的引用
            $newContent = [regex]::Replace($agentsContent, $oldPattern, ('$1' + $currentVersion + '$2'), [System.Text.RegularExpressions.RegexOptions]::None)
            Set-Content -Path $agentsPath -Value $newContent -NoNewline
            Write-Host ("[OK] AGENTS.md 当前版本号已自动从 " + $oldVersion + " 更新为 " + $currentVersion) -ForegroundColor Green
            $injected = $true
        } else {
            Write-Host ("[OK] AGENTS.md 当前版本号已是 " + $currentVersion) -ForegroundColor Green
        }
    } else {
        Write-Host "[WARN] AGENTS.md 未找到 {{APP_VERSION}} 占位符也未找到 **当前版本**：行，请手动检查" -ForegroundColor Yellow
    }
}

Write-Host "[OK] 版本号确认通过" -ForegroundColor Green

# ---------- 检查技术日志 ----------
$instructionsPath = ".github\copilot-instructions.md"
if (Test-Path $instructionsPath) {
    $instructions = Get-Content $instructionsPath -Raw
    $logPattern = '## v[\d\.]+\s*\(' + [char]0x5B + '^\)]*' + [char]0x5B + '当前版本\)'
    if ($instructions -notmatch $logPattern) {
        Write-Host "[WARN] 技术日志可能未更新" -ForegroundColor Yellow
        $continue = Read-Host "是否继续？(y/n)"
        if ($continue -ne 'y') {
            exit 1
        }
    }
}

Write-Host ""
Write-Host "[OK] 所有检查通过，可以推送"
exit 0
