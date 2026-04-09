# TimeBank 项目清理脚本
# 删除冗余和过期文件

Write-Host "=== 开始清理TimeBank项目 ===" -ForegroundColor Cyan

# 1. 删除iOS项目
if (Test-Path "ios_project") {
    Write-Host "删除 ios_project/ ..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "ios_project"
    Write-Host "✅ ios_project/ 已删除" -ForegroundColor Green
}

# 2. 删除临时文件
$tempFiles = @("temp.txt", "patch.txt", "find_penalty.py")
foreach ($file in $tempFiles) {
    if (Test-Path $file) {
        Write-Host "删除 $file ..." -ForegroundColor Yellow
        Remove-Item -Force $file
        Write-Host "✅ $file 已删除" -ForegroundColor Green
    }
}

# 3. 删除重复的timebankSync目录（保留cloudbase-functions/timebankSync）
if (Test-Path "timebankSync") {
    Write-Host "删除 timebankSync/ (重复) ..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "timebankSync"
    Write-Host "✅ timebankSync/ 已删除" -ForegroundColor Green
}

# 4. 检查Android项目中的冗余JS文件
$androidWww = "android_project/app/src/main/assets/www"
$redundantJsFiles = @("app-1.js", "app-2.js", "app-auth.js", "app-reports.js", "app-sleep.js", "app-systems.js", "app.js", "sw-register.js")

Write-Host "`n检查Android项目中的冗余JS文件..." -ForegroundColor Cyan
foreach ($file in $redundantJsFiles) {
    $filePath = Join-Path $androidWww $file
    if (Test-Path $filePath) {
        Write-Host "  发现冗余: $file" -ForegroundColor Red
        Remove-Item -Force $filePath
        Write-Host "  ✅ 已删除 $file" -ForegroundColor Green
    }
}

Write-Host "`n=== 清理完成 ===" -ForegroundColor Green
Write-Host "请手动执行以下命令提交更改:" -ForegroundColor Yellow
Write-Host "git add -A" -ForegroundColor White
Write-Host "git commit -m 'chore: 清理冗余文件和iOS项目'" -ForegroundColor White
Write-Host "git push" -ForegroundColor White
