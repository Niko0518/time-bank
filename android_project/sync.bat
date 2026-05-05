@echo off
echo [1/3] 正在编译安装包...
call .\gradlew assembleDebug

echo [2/3] 正在安装到手机...
adb install -r app\build\outputs\apk\debug\app-debug.apk

echo [3/3] 正在启动应用...
:: 请根据你 AndroidManifest.xml 里的实际包名和类名修改下方路径
adb shell am start -n com.jianglicheng.timebank/com.jianglicheng.timebank.MainActivity

echo ==========================================
echo 已完成重装并自动启动！
echo ==========================================
pause