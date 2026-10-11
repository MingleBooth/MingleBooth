@echo off
setlocal
title Sony Camera Remote SDK 2.02.00 - Isolated Live View POC Runner

cd /d "%~dp0"

echo =================================================================
echo   SONY CAMERA REMOTE SDK 2.02.00 - ISOLATED LIVE VIEW POC RUNNER
echo   Target: Sony ILCE-7CM2 (VID 054C / PID 0E8C)
echo   Mode: Pure Isolated Live View Test (NO SHUTTER / NO CAPTURE)
echo =================================================================
echo.

if not exist "build\Release\sony_camera_runner_win.exe" (
    echo [ERROR] Executable not found at build\Release\sony_camera_runner_win.exe!
    echo Please run build_poc.bat first.
    exit /b 1
)

if not exist "build\Release\Cr_Core.dll" (
    echo [WARN] Cr_Core.dll missing from build\Release. Copying from lib...
    copy /y "lib\Cr_Core.dll" "build\Release\" >nul
)

if not exist "build\Release\CrAdapter\Cr_PTP_USB.dll" (
    echo [WARN] CrAdapter missing from build\Release. Copying from lib...
    xcopy /e /i /y "lib\CrAdapter" "build\Release\CrAdapter\" >nul
)

cd build\Release
sony_camera_runner_win.exe
set POC_EXIT=%ERRORLEVEL%
cd /d "%~dp0"

echo.
echo =================================================================
echo   POC execution finished with exit code: %POC_EXIT%
echo =================================================================
exit /b %POC_EXIT%
