# TimeBank 三端同步脚本
Write-Host "=== 开始三端同步 ===" -ForegroundColor Cyan

# Android -> 根目录
Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
Write-Host "✅ index.html 已同步" -ForegroundColor Green

Copy-Item "android_project/app/src/main/assets/www/sw.js" "sw.js" -Force
Write-Host "✅ sw.js 已同步" -ForegroundColor Green

Copy-Item "android_project/app/src/main/assets/www/css/*" "css/" -Recurse -Force
Write-Host "✅ css/ 已同步" -ForegroundColor Green

Copy-Item "android_project/app/src/main/assets/www/js/*" "js/" -Recurse -Force
Write-Host "✅ js/ 已同步" -ForegroundColor Green

Write-Host "`n=== 同步完成 ===" -ForegroundColor Green
