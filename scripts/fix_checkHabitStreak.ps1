$f = "d:\TimeBank\android_project\app\src\main\assets\www\js\app-2.js"
$content = [System.IO.File]::ReadAllText($f)
$start = [regex]::Matches($content, 'function checkHabitStreak\(task, referenceDate')[0].Index
$endMarker = [regex]::Matches($content.Substring($start), '\n}')
$end = $start + $endMarker.Groups[0].Index + 1
$oldBlock = $content.Substring($start, $end - $start)
$newBlock = "// [v7.38.2] 重构 checkHabitStreak：不再调用 hasMissedHabitDayInCurrentPeriod，直接基于 rebuildHabitStreak 维护的 lastCompletionDate 判断连续性是否断开。
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
$newContent = $content.Substring(0, $start) + $newBlock + $content.Substring($end)
[System.IO.File]::WriteAllText($f, $newContent, [System.Text.Encoding]::UTF8)
Write-Output "Replaced. Old length: $($oldBlock.Length)"
