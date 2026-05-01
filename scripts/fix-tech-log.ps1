$lines = [System.IO.File]::ReadAllLines("d:\TimeBank\.github\copilot-instructions.md", [System.Text.Encoding]::UTF8)
$lines[396] = "  - `rebuildHabitStreak` 中 isBroken/isBrokenSince 写入"
$lines = $lines[0..395] + $lines[397..($lines.Length-1)]
[System.IO.File]::WriteAllLines("d:\TimeBank\.github\copilot-instructions.md", $lines, [System.Text.Encoding]::UTF8)
Write-Output "Fixed."