# === v7.38.2 步骤2：processHabitCompletion 中的 cycleAlreadyBroken ===
# 替换前：const cycleAlreadyBroken = hasMissedHabitDayInCurrentPeriod(task, transactions, referenceDate);
# 替换后：const wasCycleBrokenAt = checkHabitStreak(task, referenceDate); // 返回函数执行前的 isBroken 状态
# 替换前：if (cycleAlreadyBroken) {
# 替换后：if (wasCycleBrokenAt) {

$f = "d:\TimeBank\android_project\app\src\main\assets\www\js\app-2.js"
$c = [System.IO.File]::ReadAllText($f)

$old1 = "    const cycleAlreadyBroken = hasMissedHabitDayInCurrentPeriod(task, transactions, referenceDate);"
$new1 = "    const wasCycleBrokenAt = task.habitDetails.isBroken; // [v7.38.2] 替换：移除 hasMissedHabitDayInCurrentPeriod，依赖 checkHabitStreak 维护的 isBroken"
if ($c.Contains($old1)) {
    $c = $c.Replace($old1, $new1)
    Write-Output "Replaced cycleAlreadyBroken declaration"
} else {
    Write-Output "WARNING: old1 not found!"
}

$old2 = "    if (cycleAlreadyBroken) {"
$new2 = "    if (wasCycleBrokenAt) {"
if ($c.Contains($old2)) {
    $c = $c.Replace($old2, $new2)
    Write-Output "Replaced cycleAlreadyBroken if"
} else {
    Write-Output "WARNING: old2 not found!"
}

[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Output "Step2 done"
