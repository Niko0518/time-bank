# ============================================================
# scripts/verify-hash.ps1
# TimeBank 双源镜像 hash 校验（v9.17.8+ 工具）
#
# 职责：
#   比对 android_project/app/src/main/assets/www/ 与根目录的同名文件
#   输出每个文件的 hash + 整体状态
#
# 用法：
#   .\scripts\verify-hash.ps1
#
# 退出码：
#   0 = 全部一致（ALL-HASH-OK）
#   1 = 存在不一致或缺失（HASH-FAIL）
#
# 注意：
#   - 此脚本只汇报事实，不判断"是否应该不一致"
#   - 调用方（sync-all.ps1 等）应结合上下文判断是预期变更还是异常
# ============================================================

$files = @('index.html','sw.js','manifest.json','css\main.css','js\app-1.js','js\app-2.js','js\app-reports.js','js\app-sleep.js','js\app-systems.js','js\app-auth.js','js\ai-service.js')
$ok = $true
foreach ($f in $files) {
    $src = "android_project\app\src\main\assets\www\$f"
    if (Test-Path $f -PathType Leaf) {
        $a = (Get-FileHash $src -Algorithm SHA256).Hash
        $b = (Get-FileHash $f -Algorithm SHA256).Hash
        $match = if ($a -eq $b) { 'OK' } else { 'MISMATCH'; $ok = $false }
        Write-Host ("{0,-25} {1,-8} src={2}  dst={3}" -f $f, $match, $a.Substring(0,12), $b.Substring(0,12))
    } else {
        Write-Host ("{0,-25} MISSING-AT-ROOT" -f $f)
        $ok = $false
    }
}
if ($ok) {
    Write-Host 'ALL-HASH-OK'
    exit 0
} else {
    Write-Host 'HASH-FAIL'
    exit 1
}