$f = "d:\TimeBank\android_project\app\src\main\assets\www\js\app-2.js"
$c = [System.IO.File]::ReadAllText($f)
$idx1 = $c.IndexOf('// [v7.38.2] 重构 checkHabitStreak')
$idx2 = $c.IndexOf('function startTask')

$segment = $c.Substring($idx1, $idx2 - $idx1)
Write-Output "Before: segment length = $($segment.Length)"

# Remove the duplicate comment line (first occurrence of \n + same comment)
$duplicate = "// [v7.38.2] 重构 checkHabitStreak：`r`n// [v7.38.2] 重构 checkHabitStreak"
$segment = $segment -replace [regex]::new('// \[v7\.38\.2\] 重构 checkHabitStreak：不再调用 hasMissedHabitDayInCurrentPeriod，直接基于 rebuildHabitStreak 维护的 lastCompletionDate 判断连续性是否断开。`r`n// \[v7\.38\.2\] 重构 checkHabitStreak：不再调用 hasMissedHabitDayInCurrentPeriod，直接基于 rebuildHabitStreak 维护的 lastCompletionDate 判断连续性是否断开。'), "// [v7.38.2] 重构 checkHabitStreak：不再调用 hasMissedHabitDayInCurrentPeriod，直接基于 rebuildHabitStreak 维护的 lastCompletionDate 判断连续性是否断开。`r`n"

# The segment has 3 trailing } - remove 2 extras
# Find where the correct function ends (first } before the 3rd })
$matches = [regex]::Matches($segment, '\n}')
$secondLast = $matches[$matches.Count - 2]
$thirdLast = $matches[$matches.Count - 1]
Write-Output "2nd-last } at offset $($secondLast.Index), 3rd-last at $($thirdLast.Index)"

# Keep content up to 2nd-last } (inclusive, = 1 char after \n) + content after 3rd-last }
$before = $segment.Substring(0, $secondLast.Index + 1)  # includes the \n and }
$after = $segment.Substring($thirdLast.Index + 1)       # from after 3rd }
$segment = $before + $after

Write-Output "After: segment length = $($segment.Length)"

$newContent = $c.Substring(0, $idx1) + $segment + $c.Substring($idx2)
[System.IO.File]::WriteAllText($f, $newContent, [System.Text.Encoding]::UTF8)
Write-Output "Done. Total file length: $($newContent.Length)"
