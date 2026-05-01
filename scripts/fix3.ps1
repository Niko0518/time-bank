$f = "d:\TimeBank\android_project\app\src\main\assets\www\js\app-2.js"
$c = [System.IO.File]::ReadAllText($f)

# Find the exact section
$marker1 = '// [v7.38.2] 重构 checkHabitStreak：不再调用 hasMissedHabitDayInCurrentPeriod，直接基于 rebuildHabitStreak 维护的 lastCompletionDate 判断连续性是否断开。'
$idx1 = $c.IndexOf($marker1)

# Find "function startTask"
$idx2 = $c.IndexOf('function startTask(event, taskId)')

$segment = $c.Substring($idx1, $idx2 - $idx1)
Write-Output "Segment length: $($segment.Length)"

# Remove the orphaned second line (starts with space+中文字符, no //)
$segment = $segment -replace "`r`n 重构 checkHabitStreak：不再调用 hasMissedHabitDayInCurrentPeriod，直接基于 rebuildHabitStreak 维护的 lastCompletionDate 判断连续性是否断开。", ""

# Remove one trailing }
$segment = $segment -replace '\}\r\n\}\}', "}`r`n}"

$newContent = $c.Substring(0, $idx1) + $segment + $c.Substring($idx2)
[System.IO.File]::WriteAllText($f, $newContent, [System.Text.Encoding]::UTF8)
Write-Output "Done. New length: $($newContent.Length)"
