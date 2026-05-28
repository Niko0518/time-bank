@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo TimeBank 快速重装脚本 v8.2.16
echo ==========================================
echo.

:: [检查 1] 验证 adb 设备连接
echo [检查] 验证设备连接...
adb devices | findstr /r "[0-9].*device$" >nul
if errorlevel 1 (
    echo [错误] 未检测到已连接的设备！
    echo 请确保：
    echo   1. 手机已开启 USB 调试
    echo   2. 已通过 USB 连接电脑
    echo   3. 已授权此电脑的调试请求
    pause
    exit /b 1
)
echo [成功] 设备已连接
echo.

:: [步骤 1] 编译 APK
echo [1/3] 正在编译安装包...
echo        使用并行编译加速...

:: 清理旧 APK（可选，确保构建干净）
if exist app\build\outputs\apk\debug\app-debug.apk (
    del /q app\build\outputs\apk\debug\app-debug.apk >nul 2>&1
)

:: 使用 --parallel 并行编译加速（可提速 30-50%）
:: Gradle 默认启用 daemon，后续编译会更快
call gradlew assembleDebug --parallel 2>nul

if not exist app\build\outputs\apk\debug\app-debug.apk (
    echo [错误] 编译失败！未找到 APK 文件
    echo 请检查编译错误并修复
    pause
    exit /b 1
)
echo [成功] 编译完成
echo.

:: [步骤 2] 安装 APK
echo [2/3] 正在安装到手机...

:: 先尝试常规替换安装，将输出保存到临时文件
set INSTALL_OUTPUT=%TEMP%\adb_install_%RANDOM%.txt
adb install -r -g app\build\outputs\apk\debug\app-debug.apk > "%INSTALL_OUTPUT%" 2>&1

:: 检查安装结果
if errorlevel 1 (
    type "%INSTALL_OUTPUT%"
    echo.
    echo [诊断] 常规替换安装失败，尝试保留数据的修复方案...
    echo.
    
    :: 检查是否是签名冲突（查找关键错误关键词）
    findstr /i "signature UPDATE_INCOMPATIBLE" "%INSTALL_OUTPUT%" >nul 2>&1
    if not errorlevel 1 (
        echo [诊断] 检测到签名冲突！
        echo.
        echo [方案] 使用 adb shell pm install 命令（保留应用数据）
        echo 注意：如果系统拒绝签名覆盖，仍需手动卸载
        echo.
        
        :: 先强制停止应用
        adb shell am force-stop com.jianglicheng.timebank 2>nul
        
        :: 先推送 APK 到手机存储
        echo [1] 正在推送 APK 到手机...
        adb push app\build\outputs\apk\debug\app-debug.apk /sdcard/Download/app-debug.apk >nul 2>&1
        if errorlevel 1 (
            echo [错误] APK 推送失败！
            echo 请检查手机存储空间是否已满
            del "%INSTALL_OUTPUT%" >nul 2>&1
            pause
            exit /b 1
        )
        
        :: 使用 shell pm install 安装（-r=替换, -t=允许测试包, -d=允许降级）
        :: 某些 Android 系统允许此方式保留数据覆盖安装
        echo [2] 正在尝试保留数据的签名覆盖安装...
        adb shell pm install -r -t -d /sdcard/Download/app-debug.apk > "%INSTALL_OUTPUT%.shell" 2>&1
        
        if errorlevel 1 (
            findstr /i "signature UPDATE_INCOMPATIBLE" "%INSTALL_OUTPUT%.shell" >nul 2>&1
            if not errorlevel 1 (
                echo [警告] 系统拒绝签名覆盖（Android 安全限制）
                echo.
                echo 你有两个选择：
                echo.
                echo 选项 A：手动卸载（设置 ^> 应用 ^> TimeBank ^> 卸载）
                echo         然后重新运行此脚本
                echo.
                echo 选项 B：保留旧版本，本次跳过安装
                echo.
                choice /C YN /M "是否跳过安装（Y=跳过，N=退出脚本）"
                if errorlevel 2 (
                    del "%INSTALL_OUTPUT%" >nul 2>&1
                    del "%INSTALL_OUTPUT%.shell" >nul 2>&1
                    del /q /s %TEMP%\app-debug.apk >nul 2>&1
                    pause
                    exit /b 1
                )
                echo [已跳过] 保持旧版本运行
                del "%INSTALL_OUTPUT%" >nul 2>&1
                del "%INSTALL_OUTPUT%.shell" >nul 2>&1
                goto :skip_install
            )
        )
        
        echo [成功] 签名覆盖安装完成（数据已保留）
        del "%INSTALL_OUTPUT%.shell" >nul 2>&1
        
        :: 清理手机上的临时 APK
        adb shell rm /sdcard/Download/app-debug.apk >nul 2>&1
    ) else (
        echo [错误] 安装失败（非签名冲突）
        echo 请查看上方详细错误信息
        echo.
        echo 常见解决方案：
        echo   1. 检查手机存储空间是否充足
        echo   2. 重启 adb 服务：adb kill-server ^& adb start-server
        echo   3. 重启手机后重试
        del "%INSTALL_OUTPUT%" >nul 2>&1
        pause
        exit /b 1
    )
) else (
    type "%INSTALL_OUTPUT%" | findstr /v "^$"
    echo [成功] 安装完成
)

:skip_install
:: 清理临时文件
del "%INSTALL_OUTPUT%" >nul 2>&1
echo.

:: [步骤 3] 启动应用
echo [3/3] 正在启动应用...

:: 先停止应用（确保使用新版本）
adb shell am force-stop com.jianglicheng.timebank 2>nul

:: 启动 MainActivity
adb shell am start -n com.jianglicheng.timebank/com.jianglicheng.timebank.MainActivity >nul 2>&1

if errorlevel 1 (
    echo [警告] 启动失败，可能包名或类名不匹配
    echo 请检查 AndroidManifest.xml 中的包名和 Activity 名称
    echo.
    echo 当前使用：com.jianglicheng.timebank/.MainActivity
) else (
    echo [成功] 应用已启动
)

echo.
echo ==========================================
echo 已完成重装并自动启动！
echo ==========================================
pause