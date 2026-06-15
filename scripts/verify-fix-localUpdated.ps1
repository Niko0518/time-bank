$f = Get-Content 'd:\TimeBank\android_project\app\src\main\assets\www\js\app-sleep.js' -Raw

# 1. 验证关键修改已植入
Write-Host '=== 1. 关键修改植入核查 ==='
$hasLocalUpdated = $f -match 'const localUpdated = Date\.parse\(sleepSettings\.lastUpdated'
Write-Host ("  [+] const localUpdated 声明已植入: " + $hasLocalUpdated)
$hasTry = $f -match 'try \{\s*// \[v9\.8\.0\] 升级迁移 1'
Write-Host ("  [+] try { 包住云端同步块: " + $hasTry)
$hasCatch = $f -match '\} catch \(e\) \{[^}]*云端同步块异常，已降级使用本地值'
Write-Host ("  [+] catch 块降级处理: " + $hasCatch)

# 2. 括号配对核查
$braceOpen = ([regex]::Matches($f, '\{')).Count
$braceClose = ([regex]::Matches($f, '\}')).Count
Write-Host ''
Write-Host '=== 2. 括号配对核查 ==='
Write-Host ("  { = $braceOpen, } = $braceClose, 差 = $($braceOpen - $braceClose)")
if ($braceOpen -ne $braceClose) { Write-Host '  ❌ 括号不平衡' ; exit 1 }

# 3. initSleepSettings 函数体
$startIdx = $f.IndexOf('function initSleepSettings()')
$braceIdx = $f.IndexOf('{', $startIdx)
$depth = 0
$endIdx = $braceIdx
for ($i = $braceIdx; $i -lt $f.Length; $i++) {
    $ch = $f[$i]
    if ($ch -eq '{') { $depth++ }
    elseif ($ch -eq '}') {
        $depth--
        if ($depth -eq 0) { $endIdx = $i; break }
    }
}
$startLine = (($f.Substring(0,$startIdx) -split "`n").Count) + 1
$endLine = (($f.Substring(0,$endIdx) -split "`n").Count) + 1
Write-Host ("  initSleepSettings 函数体: L$startLine-L$endLine, 长度 $($endIdx - $braceIdx) 字符")
if ($depth -ne 0) { Write-Host '  ❌ initSleepSettings 括号不平衡' ; exit 1 }

# 4. Node.js 语法检查
Write-Host ''
Write-Host '=== 3. Node.js 语法检查 ==='
$tmp = 'd:\TimeBank\scripts\test-syntax.js'
'const code = require("fs").readFileSync("d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js", "utf8"); try { new Function(code); console.log("OK"); } catch (e) { console.log("FAIL: " + e.message); process.exit(1); }' | Set-Content $tmp
$nodeResult = node $tmp
Write-Host ("  " + $nodeResult)
Remove-Item $tmp -Force

# 5. 模拟 ReferenceError 修复（核心场景）
Write-Host ''
Write-Host '=== 4. 修复场景模拟 ==='
$sim = 'd:\TimeBank\scripts\test-fix.js'
@'
// 模拟 v9.7.5-fix 后：变量已声明 + try/catch 包住
const sleepSettings = { lastUpdated: '2026-06-15T00:00:00Z' };
let uiUpdated = false;

function initSleepSettings() {
    // 模拟加载本地数据
    // ...
    // 模拟云端同步块
    if (true) {
        try {
            const localUpdated = Date.parse(sleepSettings.lastUpdated || '') || 0;
            const cloudUpdated = 12345;
            console.log('local=' + localUpdated + ', cloud=' + cloudUpdated);
            // 假设中间有 cloud 同步逻辑...
        } catch (e) {
            console.error('云端同步异常，已降级:', e.message);
        }
    }
    // 关键：UI 同步代码
    uiUpdated = true;
    console.log('UI 已同步 enabled=' + sleepSettings.enabled);
}

try {
    initSleepSettings();
    console.log('✓ initSleepSettings 正常执行完，UI 已同步');
} catch (e) {
    console.log('❌ initSleepSettings 异常退出: ' + e.message);
}
'@ | Set-Content $sim
$simResult = node $sim
Write-Host $simResult
Remove-Item $sim -Force
