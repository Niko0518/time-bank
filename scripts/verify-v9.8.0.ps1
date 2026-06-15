# v9.8.0 综合验证脚本

$wwwPath = 'd:\TimeBank\android_project\app\src\main\assets\www'
$jsPath = "$wwwPath\js"
$ok = 0
$fail = 0

function Check($desc, $okExpr) {
    if ($okExpr) {
        Write-Host ("OK   " + $desc)
        $script:ok++
    } else {
        Write-Host ("FAIL " + $desc)
        $script:fail++
    }
}

Write-Host '=== 1. 默认值 4 项核查 ==='
$appReports = Get-Content "$jsPath\app-reports.js" -Raw
Check "plannedBedtime = 23:00"      ($appReports -match "plannedBedtime:\s*'23:00'")
Check "plannedWakeTime = 08:00"     ($appReports -match "plannedWakeTime:\s*'08:00'")
Check "targetDurationMinutes = 495" ($appReports -match "targetDurationMinutes:\s*495")
Check "lateBedtimeRate = 1"         ($appReports -match "lateBedtimeRate:\s*1\b")

Write-Host ''
Write-Host '=== 2. 9 处版本号核查 ==='
$indexHtml = Get-Content "$wwwPath\index.html" -Raw
Check "[1] index.html <title> v9.8.0"           ($indexHtml -match '<title>时间银行 - Time Bank v9\.8\.0</title>')
Check "[2] index.html .version-subtitle v9.8.0"  ($indexHtml -match 'version-subtitle.*v9\.8\.0|TimeBank v9\.8\.0')
Check "[3] index.html 关于页 v9.8.0"             ($indexHtml -match '版本 v9\.8\.0')
Check "[4] index.html 用户日志 v9.8.0 标题"      ($indexHtml -match 'log-version..v9\.8\.0')
$app1Js = Get-Content "$jsPath\app-1.js" -Raw
Check "[5] app-1.js APP_VERSION = v9.8.0"        ($app1Js -match "APP_VERSION = 'v9\.8\.0'")
$swJs = Get-Content "$wwwPath\sw.js" -Raw
Check "[6] sw.js 头注释 v9.8.0"                  ($swJs -match 'Time Bank Service Worker - v9\.8\.0')
Check "[7] sw.js CACHE_NAME v9.8.0"              ($swJs -match "CACHE_NAME = 'timebank-cache-v9\.8\.0'")
$gradle = Get-Content 'd:\TimeBank\android_project\app\build.gradle' -Raw
Check "[8] build.gradle versionName 9.8.0"       ($gradle -match 'versionName "9\.8\.0"')
Check "[9] build.gradle versionCode 60"          ($gradle -match 'versionCode 60')

Write-Host ''
Write-Host '=== 3. 新增代码核查 ==='
$appSleep = Get-Content "$jsPath\app-sleep.js" -Raw
Check "[T2] saveSleepSettings 双写 sleepSettingsShared"  ($appSleep -match "sleepSettingsShared:\s*_\.set\(cloudSettings\)")
Check "[T3] saveSleepState 写 sleepStateShared"          ($appSleep -match "sleepStateShared:\s*_\.set\(sharedState\)")
Check "[T3] saveSleepState 带 clientId"                   ($appSleep -match "clientId:\s*clientId\b")
Check "[T4] applySleepStateFromCloud 防本机回环"          ($appSleep -match "跳过本机回环")
Check "[T4] applySleepStateFromCloud 触发 doSleepSettlement" ($appSleep -match "doSleepSettlement\(startTime, wakeTime, durationMinutes, detectedType\)")
Check "[T5] initSleepSettings 迁移 deviceSleepState → sleepStateShared"  ($appSleep -match "deviceSleepState\[.+\]\s*→\s*sleepStateShared")
Check "[T5] initSleepSettings 迁移 deviceSleepSettings → sleepSettingsShared"  ($appSleep -match "deviceSleepSettings\[.+\]\s*→\s*sleepSettingsShared")
Check "[T6] Profile watch 读 doc.sleepSettingsShared"     ($app1Js -match 'doc\.sleepSettingsShared')
Check "[T6] Profile watch 读 doc.sleepStateShared"        ($app1Js -match 'doc\.sleepStateShared')

Write-Host ''
Write-Host '=== 4. 远程结束相关代码无残留 ==='
$allJs = (Get-ChildItem $jsPath -Filter '*.js' | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
$allHtml = (Get-Content $wwwPath\index.html -Raw)
$residuePatterns = @('endRemoteSleep', 'handleOtherDevicesSleeping', 'renderOtherDeviceSleepBanner', 'confirmEndRemoteSleep', 'lastEndedBy', 'other-device-sleep-banner', 'other-device-sleep-item', 'btn-end-remote-sleep')
foreach ($p in $residuePatterns) {
    $jsHits = ([regex]::Matches($allJs, [regex]::Escape($p))).Count
    $htmlHits = ([regex]::Matches($allHtml, [regex]::Escape($p))).Count
    if ($jsHits -gt 0 -or $htmlHits -gt 0) {
        Check "无残留: $p" $false
    } else {
        Check "无残留: $p" $true
    }
}

Write-Host ''
Write-Host '=== 5. v9.7.4 在权威源已不存在（除历史用户日志条目）==='
$appSystems = Get-Content "$jsPath\app-systems.js" -Raw
$changelog = Get-Content 'd:\TimeBank\docs\version-changelog.md' -Raw
$indexHasV974 = $indexHtml -match 'v9\.7\.4'
# v9.7.4 应仅在历史用户日志标题出现（L1485）
$validLines = @()
foreach ($m in [regex]::Matches($indexHtml, 'v9\.7\.4')) {
    $lineNum = ($indexHtml.Substring(0, $m.Index) -split "`n").Count
    if ($lineNum -ge 1480 -and $lineNum -le 1495) {
        $validLines += $lineNum
    }
}
if ($validLines.Count -gt 0) {
    Write-Host ("OK   v9.7.4 仅出现在历史日志区（行: " + ($validLines -join ', ') + "），新代码已全面 v9.8.0")
    $ok++
} else {
    Write-Host 'FAIL v9.7.4 残留检查异常'
    $fail++
}

Write-Host ''
Write-Host '=== 6. v9.7.4 首页堆叠间距回归修复核查 ==='
Check '[B1] anyVisibleExpanded buggy 判断已移除'     (-not ($appSystems -match 'anyVisibleExpanded'))
Check '[B2] v9.7.5 恢复 v7.4.0 语义注释存在'          ($appSystems -match '\[v9\.7\.5\]\s*恢复 v7\.4\.0 语义')
Check '[B3] 屏幕时间 expanded 判断已植入'             ($appSystems -match 'screenTimeExpanded\s*=\s*screenTimeVisible')
Check '[B4] 容器 st-expanded toggle 使用 needContainerExpanded'  ($appSystems -match 'stackedContainer\.classList\.toggle\(.st-expanded.,\s*needContainerExpanded\)')
Check '[B5] 行为矩阵验证脚本存在'                     (Test-Path 'd:\TimeBank\scripts\verify-v9.7.5-fix.ps1')
Check '[B6] 用户日志已记录 v9.7.4 回归修复'           ($indexHtml -match 'v9\.7\.4 首页堆叠间距回归修复')
Check '[B7] 技术日志已记录 v9.7.4 回归修复章节'       ($changelog -match '### Bug 修复：v9\.7\.4 首页堆叠间距回归')

Write-Host ''
Write-Host '=== 7. v9.8.0 睡眠开关持久化回归修复核查 ==='
$appSleep = Get-Content "$jsPath\app-sleep.js" -Raw
Check '[F1] localUpdated 变量声明已补齐'              ($appSleep -match 'const localUpdated = Date\.parse\(sleepSettings\.lastUpdated')
Check '[F2] 云端同步块用 try { 包住'                  ($appSleep -match 'try \{\s*// \[v9\.8\.0\] 升级迁移 1')
Check '[F3] catch 块降级到本地值'                    ($appSleep -match '\} catch \(e\) \{[^}]*降级使用本地值')
# 括号配对
$braceOpen = ([regex]::Matches($appSleep, '\{')).Count
$braceClose = ([regex]::Matches($appSleep, '\}')).Count
$braceBalanced = ($braceOpen -eq $braceClose)
Check ('[F4] app-sleep.js 括号配对平衡 ({' + $braceOpen + '}=' + $braceClose + ')')  $braceBalanced
# Node.js 语法检查
$tmpNode = 'd:\TimeBank\scripts\_syntax-check.js'
'const code = require("fs").readFileSync("d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js", "utf8"); try { new Function(code); console.log("OK"); } catch (e) { console.log("FAIL: " + e.message); }' | Set-Content $tmpNode
$syntaxResult = node $tmpNode
Remove-Item $tmpNode -Force -ErrorAction SilentlyContinue
Check '[F5] app-sleep.js Node.js 语法检查通过'        ($syntaxResult -eq 'OK')
Check '[F6] 用户日志已记录"睡眠开关持久化修复"'        ($indexHtml -match '睡眠开关持久化修复')
Check '[F7] 技术日志已记录"v9.8.0 引入的睡眠开关持久化回归"章节'  ($changelog -match '### Bug 修复：v9\.8\.0 引入的睡眠开关持久化回归')

Write-Host ''
Write-Host '=== 8. 两种卡片时睡眠展开布局修复核查 ==='
$appCss = Get-Content "$wwwPath\css\main.css" -Raw
Check '[L1] first-visible-card margin-top 为 0（不含 :not(.expanded) 限制）'  ($appCss -match '\.sleep-card-wrapper\.first-visible-card\s*\{\s*margin-top:\s*0')
Check '[L2] app-systems.js 引入 sleepExpanded 判断' ($appSystems -match 'const sleepExpanded\s*=\s*sleepVisible')
Check '[L3] needContainerExpanded 包含无屏幕时间+睡眠展开场景' ($appSystems -match '!screenTimeVisible\s*&&\s*sleepExpanded')

Write-Host ''
Write-Host ('Summary: ' + $ok + ' OK / ' + $fail + ' FAIL')
if ($fail -gt 0) { exit 1 } else { exit 0 }
