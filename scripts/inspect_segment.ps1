$f = "d:\TimeBank\android_project\app\src\main\assets\www\js\app-2.js"
$c = [System.IO.File]::ReadAllText($f)
$idx1 = $c.IndexOf('// [v7.38.2] 重构 checkHabitStreak')
$idx2 = $c.IndexOf('function startTask')
$segment = $c.Substring($idx1, $idx2 - $idx1)
Write-Output "Segment length: $($segment.Length)"
# Find the positions of } within segment
$matches = [regex]::Matches($segment, '\n}')
$endOfSegment = $segment.Length
# Find the two last } before "function startTask"
$lastFew = $matches | Select-Object -Last 5
foreach ($m in $lastFew) {
    Write-Output "Match at offset $($m.Index): '$($m.Value)'"
}
