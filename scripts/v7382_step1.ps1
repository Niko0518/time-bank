$f = "d:\TimeBank\android_project\app\src\main\assets\www\js\app-2.js"
$c = [System.IO.File]::ReadAllText($f)
$marker = 'function checkHabitStreak(task, referenceDate = new Date()) { '
$idx = $c.IndexOf($marker)
if ($idx -lt 0) { Write-Output "Marker not found!"; exit 1 }
$idx2 = $c.IndexOf('function startTask(event, taskId) {', $idx)
if ($idx2 -lt 0) { Write-Output "startTask not found!"; exit 1 }
$before = $c.Substring(0, $idx)
$after  = $c.Substring($idx2)
$newSection = "// [v7.38.2] 重构 checkHabitStreak：移除 hasMissedHabitDayInCurrentPeriod 调用（依赖全局 transactions 且与 rebuildHabitStreak 逻辑重复），添加 streak===0 提前返回，避免从未完成过的习惯被误判为断签。
function checkHabitStreak(task, referenceDate = new Date()) {
    if (task.habitDetails && task.habitDetails.type === 'abstinence') return;
    const { lastCompletionDate, period, streak } = task.habitDetails;
    if (!lastCompletionDate || streak === 0) {
        task.habitDetails.isBroken = false;
        return;
    }
    const refDate = new Date(referenceDate); refDate.setHours(0, 0, 0, 0);
    const lastDate = new Date(lastCompletionDate); lastDate.setHours(0, 0, 0, 0);
    if (lastDate >= refDate) { task.habitDetails.isBroken = false; return; }
    const diffDays = (refDate - lastDate) / 86400000;
    let isBroken = false;
    if (period === 'daily') isBroken = diffDays > 1;
    else if (period === 'weekly') {
        const refDay = refDate.getDay() === 0 ? 7 : refDate.getDay();
        const startOfThisWeek = new Date(refDate.getTime() - (refDay - 1) * 86400000);
        const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 86400000);
        isBroken = lastDate < startOfLastWeek;
    } else if (period === 'monthly') {
        isBroken = (refDate.getFullYear() * 12 + refDate.getMonth()) > (lastDate.getFullYear() * 12 + lastDate.getMonth()) + 1;
    } else isBroken = diffDays > 1;
    task.habitDetails.isBroken = isBroken;
}
"
$newContent = $before + $newSection + $after
[System.IO.File]::WriteAllText($f, $newContent, [System.Text.Encoding]::UTF8)
Write-Output "OK. New length: $($newContent.Length)"
