# ============================================================
# bump-version.ps1 - TimeBank 版本号一键升级 / 双端同步 / 校验
#
# 用法:  powershell -ExecutionPolicy Bypass -File bump-version.ps1 9.36.1
#        （不传版本号时交互输入）
#
# 功能:
#   1. 自动从 app-1.js 读取当前版本号
#   2. 替换全部"纯版本号位置"（title / 副标题 / 关于页 / APP_VERSION /
#      CACHE_NAME / sw 注释 / versionName / versionCode 自动+1 / AGENTS.md 当前版本）
#   3. 双端同步（权威源 -> 根目录 PWA 副本，5 条 Copy-Item 串行执行 + 失败即停）
#   4. diff 强校验（权威源 vs 根目录副本）
#   5. 旧版本号残留扫描（仅版本位置，不碰历史注释 / 历史版本日志）
#   6. 输出汇总
#
# 说明:
#   - 精确匹配，历史代码注释（// [v9.x.x] ...）与历史版本日志条目不会被动到
#   - 用户日志新条目需在运行本脚本前写入 index.html 关于页 <details> 顶部
#   - 编码安全：index.html / app-1.js 带 BOM 的文件升级后仍保留 BOM
# ============================================================
param(
    [string]$NewVersion = ""
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$www  = Join-Path $root 'android_project\app\src\main\assets\www'

$wwwIndex = Join-Path $www 'index.html'
$wwwApp1  = Join-Path $www 'js\app-1.js'
$wwwSw    = Join-Path $www 'sw.js'
$gradle   = Join-Path $root 'android_project\app\build.gradle'
$agents   = Join-Path $root 'AGENTS.md'
$rootIndex = Join-Path $root 'index.html'
$rootSw    = Join-Path $root 'sw.js'
$rootCss   = Join-Path $root 'css'
$rootJs    = Join-Path $root 'js'

# ---------- 编码安全的读写（保留 BOM 状态） ----------
function Read-TextPreserve($path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $hasBom = ($bytes.Length -ge 3) -and ($bytes[0] -eq 0xEF) -and ($bytes[1] -eq 0xBB) -and ($bytes[2] -eq 0xBF)
    if ($hasBom) {
        return [pscustomobject]@{ Text = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3); HasBom = $true }
    }
    return [pscustomobject]@{ Text = [System.Text.Encoding]::UTF8.GetString($bytes); HasBom = $false }
}
function Write-TextPreserve($path, $text, $hasBom) {
    $enc = New-Object System.Text.UTF8Encoding($hasBom)
    [System.IO.File]::WriteAllText($path, $text, $enc)
}
function Replace-InFile($path, $old, $new, $label) {
    $info = Read-TextPreserve $path
    $count = ([regex]::Matches($info.Text, [regex]::Escape($old))).Count
    if ($count -eq 0) {
        Write-Host ("  [SKIP] {0}: 未找到 '{1}'（可能已是最新）" -f $label, $old) -ForegroundColor DarkGray
        return
    }
    Write-TextPreserve $path $info.Text.Replace($old, $new) $info.HasBom
    Write-Host ("  [OK]   {0}: 替换 {1} 处 -> {2}" -f $label, $count, $new) -ForegroundColor Green
}

# ---------- 前置检查 ----------
foreach ($p in @($wwwIndex, $wwwApp1, $wwwSw, $gradle, $agents)) {
    if (-not (Test-Path $p)) { Write-Host "缺少文件: $p" -ForegroundColor Red; exit 1 }
}

# ---------- 1. 读取当前版本 ----------
$app1Info = Read-TextPreserve $wwwApp1
$m = [regex]::Match($app1Info.Text, "const APP_VERSION = 'v(\d+\.\d+\.\d+)'")
if (-not $m.Success) { Write-Host "无法从 app-1.js 读取当前版本号！" -ForegroundColor Red; exit 1 }
$oldVersion = $m.Groups[1].Value

if ([string]::IsNullOrWhiteSpace($NewVersion)) {
    $NewVersion = Read-Host "请输入新版本号（当前 $oldVersion，例如 9.36.1）"
}
$NewVersion = $NewVersion.Trim()
if ($NewVersion -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "版本号格式错误：$NewVersion （应为 x.y.z）" -ForegroundColor Red; exit 1
}
if ($NewVersion -eq $oldVersion) {
    Write-Host "新版本号与当前版本号相同（$oldVersion），无需升级。" -ForegroundColor Yellow; exit 0
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 版本号升级: $oldVersion -> $NewVersion" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ---------- 2. 替换版本号位置 ----------
Write-Host "`n[1/6] 版本号位置替换" -ForegroundColor Cyan
Replace-InFile $wwwIndex ("- Time Bank v" + $oldVersion) ("- Time Bank v" + $NewVersion) "index.html <title>"
Replace-InFile $wwwIndex ("TimeBank v" + $oldVersion + " ·") ("TimeBank v" + $NewVersion + " ·") "index.html 副标题"
Replace-InFile $wwwIndex (">版本 v" + $oldVersion + "</div>") (">版本 v" + $NewVersion + "</div>") "index.html 关于页"
Replace-InFile $wwwApp1 ("const APP_VERSION = 'v" + $oldVersion + "'") ("const APP_VERSION = 'v" + $NewVersion + "'") "app-1.js APP_VERSION"
Replace-InFile $wwwSw ("Service Worker - v" + $oldVersion) ("Service Worker - v" + $NewVersion) "sw.js 注释"
Replace-InFile $wwwSw ("timebank-cache-v" + $oldVersion) ("timebank-cache-v" + $NewVersion) "sw.js CACHE_NAME"
Replace-InFile $gradle ('versionName "' + $oldVersion + '"') ('versionName "' + $NewVersion + '"') "build.gradle versionName"
Replace-InFile $agents ("``v" + $oldVersion + "``") ("``v" + $NewVersion + "``") "AGENTS.md 当前版本"

# versionCode 自动 +1
$gradleInfo = Read-TextPreserve $gradle
$vcMatch = [regex]::Match($gradleInfo.Text, 'versionCode\s+(\d+)')
if ($vcMatch.Success) {
    $newCode = [int]$vcMatch.Groups[1].Value + 1
    Write-TextPreserve $gradle $gradleInfo.Text.Replace($vcMatch.Value, 'versionCode ' + $newCode) $gradleInfo.HasBom
    Write-Host ("  [OK]   build.gradle versionCode: {0} -> {1}" -f $vcMatch.Groups[1].Value, $newCode) -ForegroundColor Green
} else {
    Write-Host "  [SKIP] build.gradle 未找到 versionCode" -ForegroundColor DarkGray
}

# ---------- 3. 双端同步 ----------
Write-Host "`n[2/6] 双端同步（权威源 -> 根目录）" -ForegroundColor Cyan
$syncPairs = @(
    @{ Src = Join-Path $www 'index.html';      Dst = $rootIndex },
    @{ Src = Join-Path $www 'sw.js';           Dst = $rootSw },
    @{ Src = Join-Path $www 'manifest.json';   Dst = Join-Path $root 'manifest.json' },
    @{ Src = Join-Path $www 'css\*';           Dst = $rootCss },
    @{ Src = Join-Path $www 'js\*';            Dst = $rootJs }
)
foreach ($p in $syncPairs) {
    try {
        Copy-Item $p.Src $p.Dst -Recurse -Force -ErrorAction Stop
        Write-Host ("  [SYNC OK] {0} -> {1}" -f (Split-Path $p.Src -Leaf), $p.Dst) -ForegroundColor Green
    } catch {
        Write-Host ("  [SYNC FAIL] {0}: {1}" -f $p.Src, $_.Exception.Message) -ForegroundColor Red
        exit 1
    }
}

# ---------- 4. diff 强校验 ----------
Write-Host "`n[3/6] diff 强校验（权威源 vs 根目录副本）" -ForegroundColor Cyan
$diffPairs = @(
    @( (Join-Path $www 'index.html'),   $rootIndex ),
    @( (Join-Path $www 'sw.js'),        $rootSw ),
    @( (Join-Path $www 'js\app-1.js'),  (Join-Path $root 'js\app-1.js') ),
    @( (Join-Path $www 'js\app-2.js'),  (Join-Path $root 'js\app-2.js') ),
    @( (Join-Path $www 'css\main.css'), (Join-Path $root 'css\main.css') )
)
$diffErrors = 0
foreach ($pair in $diffPairs) {
    $d = Compare-Object (Get-Content $pair[0]) (Get-Content $pair[1])
    if ($d) {
        Write-Host ("  [DIFF FAIL] {0} 与副本不一致" -f (Split-Path $pair[0] -Leaf)) -ForegroundColor Red
        $d | Select-Object -First 5 | ForEach-Object { Write-Host ("      {0} {1}" -f $_.SideIndicator, $_.InputObject) -ForegroundColor Yellow }
        $diffErrors++
    } else {
        Write-Host ("  [DIFF OK] {0} 一致" -f (Split-Path $pair[0] -Leaf)) -ForegroundColor Green
    }
}

# ---------- 5. 旧版本号残留扫描（仅版本位置，不含历史注释/日志） ----------
Write-Host "`n[4/6] 旧版本号残留扫描" -ForegroundColor Cyan
$scanTargets = @(
    @{ Path = $wwwIndex; Pattern = "- Time Bank v" + $oldVersion;         Label = "index.html <title>" },
    @{ Path = $wwwIndex; Pattern = "TimeBank v" + $oldVersion + " ·";     Label = "index.html 副标题" },
    @{ Path = $wwwIndex; Pattern = ">版本 v" + $oldVersion + "</div>";    Label = "index.html 关于页" },
    @{ Path = $wwwApp1;  Pattern = "APP_VERSION = 'v" + $oldVersion + "'"; Label = "app-1.js APP_VERSION" },
    @{ Path = $wwwSw;    Pattern = "Service Worker - v" + $oldVersion;    Label = "sw.js 注释" },
    @{ Path = $wwwSw;    Pattern = "cache-v" + $oldVersion;               Label = "sw.js CACHE_NAME" },
    @{ Path = $gradle;   Pattern = 'versionName "' + $oldVersion + '"';   Label = "build.gradle versionName" }
)
$residue = 0
foreach ($t in $scanTargets) {
    $text = (Read-TextPreserve $t.Path).Text
    if ($text.Contains($t.Pattern)) {
        Write-Host ("  [残留] {0} 仍含旧版本号" -f $t.Label) -ForegroundColor Red
        $residue++
    } else {
        Write-Host ("  [OK]   {0} 已更新" -f $t.Label) -ForegroundColor Green
    }
}

# ---------- 6. 汇总 ----------
Write-Host "`n[5/6] 版本号残留全库快照（确认只应出现在历史注释/历史日志）" -ForegroundColor Cyan
$globalOld = (Get-ChildItem $root -Recurse -Include *.js,*.css,*.html,*.md,*.json,*.gradle -File |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\.git\\' } |
    Select-String -Pattern ('v' + $oldVersion) -List).Path
if ($globalOld) {
    Write-Host "  下列文件仍含 v$oldVersion（历史注释/日志为预期，如非历史需人工处理）:" -ForegroundColor Yellow
    $globalOld | ForEach-Object { Write-Host ("    - " + $_) -ForegroundColor Yellow }
} else {
    Write-Host "  全库无 v$oldVersion 残留" -ForegroundColor Green
}

Write-Host "`n[6/6] 结果汇总" -ForegroundColor Cyan
$allOk = ($diffErrors -eq 0) -and ($residue -eq 0)
if ($allOk) {
    Write-Host "  ✅ 版本号 $oldVersion -> $NewVersion 已全部完成，双端一致，无版本位置残留。" -ForegroundColor Green
} else {
    Write-Host "  ❌ 存在不一致或残留，请检查上方红色项。" -ForegroundColor Red
}
Write-Host "`n下一步（AI / 开发者手动）:" -ForegroundColor Cyan
Write-Host "  1. 撰写技术日志（docs/version-changelog.md 顶部，精简格式）"
Write-Host "  2. 若尚未撰写，写入用户日志（index.html 关于页 <details> 顶部）"
Write-Host "  3. git add -A && git commit && git push"
Write-Host "  （注意：本脚本不做 git 操作，也不自动构建安装）"
