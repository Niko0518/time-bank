@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   TimeBank - USB ADB Install
echo ========================================
echo.

:: 1. Check ADB connection
echo [1/4] Checking device connection...
adb devices | findstr /r "device$" >nul 2>&1
if errorlevel 1 (
    echo ERROR: No device connected via ADB
    echo Please enable USB debugging on your phone and connect via USB
    pause
    exit /b 1
)
echo Device connected OK

:: 2. Clean and build Debug APK
echo.
echo [2/4] Building Debug APK...
cd /d "%~dp0"
call gradlew.bat clean assembleDebug --no-daemon -q
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)
echo Build OK

:: 3. Force stop app to release locks
echo.
echo [3/4] Stopping app...
adb shell am force-stop com.jianglicheng.timebank 2>nul

:: 4. Install APK (update existing installation)
echo.
echo [4/4] Installing/Updating APK...
set "APK_PATH=app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK_PATH%" (
    echo ERROR: APK not found: %APK_PATH%
    pause
    exit /b 1
)

adb install -r -d -g "%APK_PATH%"
if errorlevel 1 (
    echo ERROR: Install/Update failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Install Success!
echo ========================================
echo.
