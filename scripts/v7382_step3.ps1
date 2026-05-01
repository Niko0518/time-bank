# === v7.38.2 步骤3：renderTasks 中的 isCycleBroken ===
# 替换前：const isCycleBroken = isDailyPeriod && hasMissedHabitDayInCurrentPeriod(task, transactions, new Date());
# 替换后：const isCycleBroken = isDailyPeriod && (task.habitDetails.isBroken === true);

$f = "d:\TimeBank\android_project\app\src\main\assets\www\js\app-2.js"
$c = [System.IO.File]::ReadAllText($f)

$old = "                const isCycleBroken = isDailyPeriod && hasMissedHabitDayInCurrentPeriod(task, transactions, new Date());"
$new = "                const isCycleBroken = isDailyPeriod && (task.habitDetails.isBroken === true); // [v7.38.2] 替换：依赖 checkHabitStreak 维护的 isBroken，不再调用 hasMissedHabitDayInCurrentPeriod"
if ($c.Contains($old)) {
    $c = $c.Replace($old, $new)
    Write-Output "Replaced isCycleBroken in renderTasks"
} else {
    Write-Output "WARNING: renderTasks isCycleBroken not found! Trying without leading spaces..."
    $alt = "const isCycleBroken = isDailyPeriod && hasMissedHabitDayInCurrentPeriod(task, transactions, new Date());"
    if ($c.Contains($alt)) {
        $c = $c.Replace($alt, $new)
        Write-Output "Replaced (alt without spaces)"
    } else {
        Write-Output "ERROR: not found at all"
    }
}

[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Output "Step3 done"
