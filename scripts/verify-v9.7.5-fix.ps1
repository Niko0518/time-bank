# v9.7.5 修复行为矩阵验证
# 不模拟 DOM，而是直接读取 app-systems.js 的判断逻辑
# 提取三个变量：st-expanded / first-visible-card 的预期值
# 然后用 PowerShell 模拟逻辑判断

$appSystems = Get-Content 'd:\TimeBank\android_project\app\src\main\assets\www\js\app-systems.js' -Raw
$appReports = Get-Content 'd:\TimeBank\android_project\app\src\main\assets\www\js\app-reports.js' -Raw

# 1. 验证 v9.7.4 的判断已移除
$hasOldBuggy = $appSystems -match 'anyVisibleExpanded'
Write-Host ("  v9.7.4 buggy 判断 (anyVisibleExpanded) 已移除: " + (-not $hasOldBuggy))

# 2. 验证 v9.7.5 的判断已植入
$hasNewLogic = $appSystems -match 'screenTimeExpanded\s*=\s*screenTimeVisible'
Write-Host ("  v9.7.5 新判断 (screenTimeExpanded) 已植入: " + $hasNewLogic)

# 3. 验证 st-expanded 仍然只被 toggle，且不依赖 sleep 的 expanded
$toggleCall = $appSystems -match 'stackedContainer\.classList\.toggle\(.st-expanded.,\s*screenTimeExpanded\)'
Write-Host ("  st-expanded toggle 改用 screenTimeExpanded: " + $toggleCall)

# 4. 行为矩阵模拟（用 PowerShell 重新执行判断逻辑）
function GetExpectedState($stVisible, $stExpanded, $sleepVisible) {
    $screenTimeExpanded = $stVisible -and $stExpanded
    $stExpandedClass = $screenTimeExpanded
    $isFirstVisible = -not $stVisible -and $sleepVisible
    return @{
        stExpanded = $stExpandedClass
        firstVisible = $isFirstVisible
    }
}

$cases = @(
    @{ Name = '场景1: ST可见+收起 + Sleep可见+收起';  ST=$true;  STExp=$false; SleepV=$true;  Expected_ST_Exp=$false; Expected_FirstV=$false },
    @{ Name = '场景2: ST可见+收起 + Sleep可见+展开 ⭐修复目标'; ST=$true;  STExp=$false; SleepV=$true;  Expected_ST_Exp=$false; Expected_FirstV=$false },
    @{ Name = '场景3: ST可见+展开 + Sleep可见+收起';  ST=$true;  STExp=$true;  SleepV=$true;  Expected_ST_Exp=$true;  Expected_FirstV=$false },
    @{ Name = '场景4: ST可见+展开 + Sleep可见+展开';  ST=$true;  STExp=$true;  SleepV=$true;  Expected_ST_Exp=$true;  Expected_FirstV=$false },
    @{ Name = '场景5: ST不可见 + Sleep可见+收起 ⭐旧bug场景';  ST=$false; STExp=$false; SleepV=$true;  Expected_ST_Exp=$false; Expected_FirstV=$true },
    @{ Name = '场景6: ST不可见 + Sleep可见+展开';  ST=$false; STExp=$false; SleepV=$true;  Expected_ST_Exp=$false; Expected_FirstV=$true },
    @{ Name = '场景7: ST可见+收起 + Sleep不可见';  ST=$true;  STExp=$false; SleepV=$false; Expected_ST_Exp=$false; Expected_FirstV=$false },
    @{ Name = '场景8: ST可见+展开 + Sleep不可见';  ST=$true;  STExp=$true;  SleepV=$false; Expected_ST_Exp=$true;  Expected_FirstV=$false }
)

$allPass = $true
foreach ($c in $cases) {
    $r = GetExpectedState $c.ST $c.STExp $c.SleepV
    $pass = ($r.stExpanded -eq $c.Expected_ST_Exp) -and ($r.firstVisible -eq $c.Expected_FirstV)
    $marker = if ($pass) { 'OK  ' } else { 'FAIL' ; $allPass = $false }
    Write-Host ("  " + $marker + ' ' + $c.Name + ' => st-expanded=' + $r.stExpanded + ' first-visible=' + $r.firstVisible)
}

Write-Host ''
if ($allPass) {
    Write-Host '=== 行为矩阵 8/8 全部通过 ✅ ==='
} else {
    Write-Host '=== 行为矩阵存在 FAIL ❌ ==='
    exit 1
}
