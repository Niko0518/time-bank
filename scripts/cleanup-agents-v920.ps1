# 删除 AGENTS.md 中混杂的 v9.1.0 - 改造 B/C/D 残留内容
# 起点：line 575（"v9.1.0 是一个大版本" 副本） 之前应该有 v9.1.0 结束符 ---
# 终点：line 761（"---" 在 v9.0.10 之前）

$path = "d:\TimeBank\AGENTS.md"
$content = Get-Content $path -Raw

# 找到被破坏区域的起点（v9.1.0 改造 B 残留的"进入9.1.0版本更新"quote）
# 找到终点的"---"在 v9.0.10 标题之前
$startMarker = "## v9.1.0 - 改造 B：报告页 AI 伙伴（时光）+ AI 洞察报告 合并卡片"
$startMarkerAlt1 = "进入9.1.0版本更新。将报告页面的AI洞察报告和时光卡片合并"
$endMarker = "## v9.0.10（完善"

# 查找 start 位置（先尝试原 marker，找不到用 alt）
$startIdx = $content.IndexOf($startMarker)
if ($startIdx -lt 0) {
    $startIdx = $content.IndexOf($startMarkerAlt1)
    if ($startIdx -lt 0) {
        Write-Host "ERROR: Could not find start marker"
        exit 1
    }
    # alt marker 是 quote，回退到最近的 --- 或 # 标题
    $prefix = $content.Substring(0, $startIdx)
    $lastDelimiter = $prefix.LastIndexOf("---")
    $lastHeading = $prefix.LastIndexOf("## ")
    $newStart = [Math]::Max($lastDelimiter, $lastHeading)
    if ($newStart -gt 0) { $startIdx = $newStart }
}

# 查找 end 位置
$endIdx = $content.IndexOf($endMarker)
if ($endIdx -lt 0) {
    Write-Host "ERROR: Could not find end marker"
    exit 1
}
# end 之前的 --- 分隔符
$prefix = $content.Substring(0, $endIdx)
$lastDelim = $prefix.LastIndexOf("---")
if ($lastDelim -gt 0) { $endIdx = $lastDelim }

Write-Host "Deleting from offset $startIdx to $endIdx ($($endIdx - $startIdx) chars)"

$newContent = $content.Substring(0, $startIdx) + $content.Substring($endIdx)
Set-Content -Path $path -Value $newContent -NoNewline
Write-Host "Done. File size: $((Get-Content $path -Raw).Length) bytes"
