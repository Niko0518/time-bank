@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================
:: TimeBank - USB ADB Install
:: 增强版：带超时检测和日志
:: ============================

set "LOG_FILE=%~dp0install.log"
set "BUILD_TIMEOUT=300"

echo ========================================
echo   TimeBank - USB ADB Install
echo ========================================
echo.

:: 0. 清理可能的卡住进程
echo [0/5] Checking for stuck processes...
tasklist /fi "imagename eq java.exe" 2>nul | findstr /i "java" >nul
if not errorlevel 1 (
    echo WARNING: Found running Java processes
    echo Attempting to stop Gradle daemon...
    cd /d "%~dp0"
    gradlew.bat --stop 2>nul
    timeout /t 2 /nobreak >nul
)
echo Done

:: 1. Check ADB connection
echo.
echo [1/5] Checking device connection...
adb devices | findstr /r "device$" >nul 2>&1
if errorlevel 1 (
    echo ERROR: No device connected via ADB
    echo Please enable USB debugging on your phone and connect via USB
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)
echo Device connected OK

:: 2. Clean and build Debug APK with timeout monitoring
echo.
echo [2/5] Building Debug APK (timeout: %BUILD_TIMEOUT% seconds)...
echo This may take several minutes on first build...
echo.

cd /d "%~dp0"

:: 删除旧日志
del /f /q "%LOG_FILE%" 2>nul

:: 启动 Gradle 构建（后台运行以便监控）
start /b cmd /c "gradlew.bat clean assembleDebug --no-daemon > ""%LOG_FILE%"" 2>&1"

:: 监控构建进度
set "elapsed=0"
set "last_size=0"

:wait_build
timeout /t 5 /nobreak >nul
set /a elapsed+=5

if %elapsed% geq %BUILD_TIMEOUT% (
    echo.
    echo ERROR: Build timeout exceeded (%BUILD_TIMEOUT% seconds)
    echo Killing stuck process...
    taskkill /f /im java.exe 2>nul
    echo.
    echo Build log saved to: %LOG_FILE%
    echo Last 30 lines of log:
    echo ========================================
    powershell -Command "Get-Content '%LOG_FILE%' -Tail 30"
    echo ========================================
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

:: 检查构建是否完成
if not exist "app\build\outputs\apk\debug\app-debug.apk" (
    :: 检查进程是否还在运行
    tasklist /fi "imagename eq java.exe" 2>nul | findstr /i "java" >nul
    if errorlevel 1 (
        :: Java 进程结束，检查结果
        goto check_build_result
    )
    
    :: 显示进度
    echo ... Building (elapsed: %elapsed%s)
    goto wait_build
)

:check_build_result
echo.
if exist "app\build\outputs\apk\debug\app-debug.apk" (
    echo Build completed successfully!
) else (
    echo Build failed!
    echo.
    echo Build log:
    echo ========================================
    if exist "%LOG_FILE%" (
        type "%LOG_FILE%"
    ) else (
        echo Log file not found.
    )
    echo ========================================
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

:: 3. Force stop app to release locks
echo.
echo [3/5] Stopping app on device...
adb shell am force-stop com.jianglicheng.timebank 2>nul
echo Done

:: 4. Install APK (update existing installation)
echo.
echo [4/5] Installing/Updating APK...
set "APK_PATH=app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK_PATH%" (
    echo ERROR: APK not found: %APK_PATH%
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

adb install -r -d -g "%APK_PATH%"
if errorlevel 1 (
    echo ERROR: Install/Update failed
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

:: 5. Launch app
echo.
echo [5/5] Launching app...
adb shell am start -n com.jianglicheng.timebank/.MainActivity
echo Done

echo.
echo ========================================
echo   Install Success!
echo ========================================
echo APK: %APK_PATH%
echo.
echo Press any key to exit...
pause >nul
